"""
Chat API routes.

Belongs to: API layer
Responsibility: HTTP interfaces for chat operations
Restrictions: Thin controller - all logic delegated to services
"""
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple, Set
import csv
import re
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
import logging

logger = logging.getLogger(__name__)

from app.api.deps import DBSession, AuthenticatedUser, RateLimitedUser
from app.services import chat_service
from sqlmodel import select
from app.models.analysis_contract import AnalysisContract
from app.services.analysis_orchestrator import run_analysis_orchestration
from app.core.exceptions import ResourceNotFound, AuthorizationError, InvalidOperation
from app.services.llm.intent_classifier import classify_intent_fast, FAST_INTENT_LABELS


router = APIRouter()

# Lightweight in-memory replay index by session.
# Keeps normalized user queries seen in this process to avoid DB scans on every send.
_SESSION_QUERY_INDEX: dict[str, Set[str]] = {}
_SESSION_INDEX_WARMED: Set[str] = set()


def _is_simple_chat_query(query: str) -> bool:
    """Detect simple greetings and help prompts that should stay conversational."""
    normalized = (query or "").lower().strip()
    if not normalized:
        return False

    if _explicitly_requests_visual(normalized) or _looks_interpretive_query(normalized):
        return False

    analytic_terms = [
        "chart", "graph", "dashboard", "trend", "sales by", "revenue by", "count", "total",
        "average", "sum", "compare", "compare", "group by", "show me", "analyze", "analysis",
    ]
    if any(term in normalized for term in analytic_terms):
        return False

    greeting_terms = [
        "hello", "hi", "hey", "greetings", "good morning", "good afternoon", "good evening",
        "can you help me", "help me", "how are you",
    ]
    return any(term in normalized for term in greeting_terms)


def _build_simple_chat_response(query: str, has_dataset: bool) -> str:
    """Build a lightweight conversational response for non-analytical chat."""
    if has_dataset:
        return (
            "Hello! I can help with your data. Ask me about total sales, counts, trends, or comparisons, "
            "and I’ll use the dataset you attached."
        )

    return (
        "Hello! I can help with your data. Please attach a dataset and I’ll answer questions about "
        "total sales, counts, trends, or comparisons."
    )


def _is_percentage_kpi(kpi_label: str, chart_spec: dict) -> bool:
    """Detect whether KPI should be rendered as a percentage."""
    column_metadata = chart_spec.get("column_metadata", {}) if isinstance(chart_spec, dict) else {}
    for meta in column_metadata.values():
        if isinstance(meta, dict) and isinstance(meta.get("display_format"), dict):
            if meta["display_format"].get("type") in ("percentage", "percent"):
                return True

    label = (kpi_label or "").lower()
    # Exclude pay rates — 'daily rate', 'hourly rate' etc. are currency, not percent
    if label.startswith("usd") or (any(p in label for p in ["daily", "hourly", "monthly", "annual"]) and "rate" in label):
        return False

    percentage_keywords = [
        "percent", "percentage", "pct", "%", "ratio", "margin", "churn"
    ]
    return any(kw in label for kw in percentage_keywords) or (
        "rate" in label and not any(p in label for p in ["daily", "hourly", "monthly", "annual"])
    )


def _format_percentage_value(value: Any) -> str:
    """Format numeric values as percentage (e.g. 26.74%). Handles decimal ratios and raw percentages."""
    if not isinstance(value, (int, float)):
        return str(value)
    
    val_float = float(value)
    # Detect if the value is a decimal ratio (e.g. between -1.0 and 1.0, non-zero)
    if 0.0 < abs(val_float) <= 1.0:
        val_float *= 100.0
        
    formatted = f"{val_float:,.2f}".rstrip("0").rstrip(".")
    return f"{formatted}%"


def _looks_percentage_metric_name(metric_name: str, column_metadata: Optional[dict] = None) -> bool:
    """Detect if metric name represents a percentage."""
    metadata = column_metadata or {}
    meta = metadata.get(metric_name, {}) if isinstance(metadata, dict) else {}
    display_format = meta.get("display_format", {}) if isinstance(meta, dict) else {}
    if isinstance(display_format, dict) and display_format.get("type") in ("percentage", "percent"):
        return True

    label = (metric_name or "").lower()
    if label.startswith("usd") or (any(p in label for p in ["daily", "hourly", "monthly", "annual"]) and "rate" in label):
        return False

    percentage_keywords = [
        "percent", "percentage", "pct", "%", "ratio", "margin", "churn"
    ]
    return any(kw in label for kw in percentage_keywords) or (
        "rate" in label and not any(p in label for p in ["daily", "hourly", "monthly", "annual"])
    )


def _is_currency_kpi(kpi_label: str, chart_spec: dict) -> bool:
    """Detect whether KPI should be rendered as currency."""
    column_metadata = chart_spec.get("column_metadata", {}) if isinstance(chart_spec, dict) else {}
    for meta in column_metadata.values():
        if isinstance(meta, dict) and isinstance(meta.get("display_format"), dict):
            if meta["display_format"].get("type") == "currency":
                return True

    label = (kpi_label or "").lower()
    currency_keywords = [
        "revenue", "profit", "income", "earnings", "cost", "expense",
        "price", "charges", "charge", "payment", "budget", "salary", "wage",
        "fee", "sales", "discount", "amount", "value", "spent", "spend",
        "spending", "mrr", "arr", "billing", "bill"
    ]
    return any(kw in label for kw in currency_keywords)


def _currency_symbol_from_code(code: str) -> str:
    mapping = {
        "USD": "$",
        "GBP": "£",
        "EUR": "€",
        "INR": "₹",
        "JPY": "¥",
        "CNY": "¥",
        "KRW": "₩",
        "AUD": "A$",
        "CAD": "C$",
        "SGD": "S$",
        "NZD": "NZ$",
        "BRL": "R$",
        "MXN": "Mex$",
    }
    return mapping.get((code or "").upper(), "$")


def _kpi_currency_symbol(chart_spec: dict) -> str:
    column_metadata = chart_spec.get("column_metadata", {}) if isinstance(chart_spec, dict) else {}
    for meta in column_metadata.values():
        display_format = meta.get("display_format", {}) if isinstance(meta, dict) else {}
        if isinstance(display_format, dict) and display_format.get("type") == "currency":
            return _currency_symbol_from_code(display_format.get("currency", "USD"))
    return "$"


def _format_compact_value(value: object, is_currency: bool = False, currency_symbol: str = "$") -> str:
    """Format numeric values into compact K/M form for readability."""
    if not isinstance(value, (int, float)):
        return str(value)

    abs_value = abs(float(value))
    sign = "-" if float(value) < 0 else ""

    if abs_value >= 1_000_000_000:
        num = abs_value / 1_000_000_000
        suffix = "B"
    elif abs_value >= 1_000_000:
        num = abs_value / 1_000_000
        suffix = "M"
    elif abs_value >= 1_000:
        num = abs_value / 1_000
        suffix = "K"
    else:
        if isinstance(value, int) or float(value).is_integer():
            base = f"{int(value):,}"
        else:
            base = f"{float(value):,.2f}".rstrip("0").rstrip(".")
        return f"{currency_symbol}{base}" if is_currency else base

    decimals = 2 if num < 10 else (1 if num < 100 else 0)
    formatted = f"{sign}{num:.{decimals}f}"
    if "." in formatted:
        formatted = formatted.rstrip("0").rstrip(".")
    compact = formatted + suffix
    return f"{currency_symbol}{compact}" if is_currency else compact


def _looks_currency_metric_name(metric_name: str) -> bool:
    text = (metric_name or "").lower()
    if any(k in text for k in ["quantity", "qty", "count", "unit", "units", "volume"]):
        return False
    return any(
        k in text for k in [
            "revenue", "profit", "income", "earnings", "cost", "expense", "price", "charges", "payment",
            "budget", "salary", "wage", "fee", "sales", "discount", "amount", "mrr", "arr", "billing",
        ]
    )


def _metric_currency_symbol(metric_name: str, column_metadata: Optional[dict]) -> str:
    metadata = column_metadata or {}
    meta = metadata.get(metric_name, {}) if isinstance(metadata, dict) else {}
    display_format = meta.get("display_format", {}) if isinstance(meta, dict) else {}
    if isinstance(display_format, dict) and display_format.get("type") == "currency":
        return _currency_symbol_from_code(display_format.get("currency", "USD"))
    return "$"


def _build_numbered_metric_summary(
    data_rows: List[dict],
    columns: List[str],
    column_metadata: Optional[dict],
) -> Optional[str]:
    """Return metric lines for single-row aggregate outputs."""
    if not data_rows or len(data_rows) != 1:
        return None

    row = data_rows[0] if isinstance(data_rows[0], dict) else {}
    if not isinstance(row, dict) or not row:
        return None

    candidate_columns = columns or list(row.keys())
    numeric_metrics = []
    for col in candidate_columns:
        value = row.get(col)
        if isinstance(value, (int, float)):
            numeric_metrics.append((col, value))

    if not numeric_metrics:
        return None

    lines: List[str] = []
    for metric, value in numeric_metrics:
        if _looks_percentage_metric_name(metric, column_metadata):
            formatted = _format_percentage_value(value)
        else:
            is_currency = _looks_currency_metric_name(metric)
            symbol = _metric_currency_symbol(metric, column_metadata)
            formatted = _format_compact_value(value, is_currency=is_currency, currency_symbol=symbol)
        label = metric.replace("_", " ").title()
        lines.append(f"**{label}:** {formatted}")

    return "\n".join(lines)


def _looks_interpretive_query(query: str) -> bool:
    """Detect analyst-style explanatory queries (why/driver/cause/dip/drop questions)."""
    q = (query or "").lower().strip()
    q = re.sub(r"[^\w\s]", " ", q)
    patterns = [
        r"\bwhy\b",
        r"\bwhat\s+drives?\b",
        r"\bwhat\s+is\s+driving\b",
        r"\b(what|which)\s+(are\s+)?(the\s+)?(main|key|top)\s+drivers?\b",
        r"\bdrivers?\s+of\b",
        r"\b(revenue|sales|profit|margin|cost|churn|attrition|retention|conversion|growth)\s+drivers?\b",
        r"\bwhat\s+causes?\b",
        r"\bexplain\b",
        r"\breason\s+for\b",
        r"\breasons?\b",
        r"\bdip\b",
        r"\bdrop\b",
        r"\bdecline\b",
        r"\bdecrease\b",
        r"\broot\s+cause\b",
        r"\bwhat\s+is\s+behind\b",
        r"\bfactors?\s+behind\b",
    ]
    return any(re.search(p, q) for p in patterns)


# ────────────────────────────────────────────────────────────────────────
# Column-clarification rewrite
# ────────────────────────────────────────────────────────────────────────
# The frontend asks the user to disambiguate when a keyword (e.g. "product")
# matches multiple columns. The user's reply is sent as a canonical sentence:
#
#     For my query "<original>", I meant column "<chosen>" instead of "<term>"
#
# The legacy implementation did a global regex substitution on the original
# query string (\b<term>\b → <chosen>). When the chosen column already
# contained the term as a substring (very common: "Product Name" contains
# "Name"), the substitution looped and produced text like
# "Product Product Name" or, across repeated turns, "Name Name Name Name".
#
# The legacy code also failed to suppress the ambiguity re-trigger: after the
# rewrite, the executor's find_ambiguous_columns() would scan the rewritten
# text for the same broad keyword ("product") and re-prompt the user.
#
# The fix below replaces the natural-language rewrite with a structured
# marker line that is:
#   • appended to the original query verbatim — never interleaved into it,
#     so the original query text is preserved byte-for-byte;
#   • consumed by the executor (see executor._apply_clarification_marker),
#     which uses it to (a) seed a forced column hint and (b) skip the
#     ambiguity check for the resolved term.
# ────────────────────────────────────────────────────────────────────────

_CLARIFICATION_SENTENCE_RE = re.compile(
    r'^For my query "(?P<original>.*)", I meant column "(?P<chosen>.*)" instead of "(?P<term>.*)"$',
    re.IGNORECASE | re.DOTALL,
)

_CLARIFICATION_MARKER_PREFIX = "[Column Clarification"


def _parse_clarification_sentence(text: str) -> Optional[Tuple[str, str, str]]:
    """Parse the canonical frontend clarification sentence.

    Returns ``(original_query, term, chosen_column)`` on match, else ``None``.
    Empty components are rejected so a malformed sentence falls through
    unchanged instead of producing an empty marker.
    """
    if not text:
        return None
    m = _CLARIFICATION_SENTENCE_RE.match(text.strip())
    if not m:
        return None
    original = m.group("original").strip()
    chosen = m.group("chosen").strip()
    term = m.group("term").strip()
    if not original or not chosen or not term:
        return None
    return original, term, chosen


def _rewrite_clarification_query(text: str) -> str:
    """If ``text`` is a clarification sentence, return
    ``"<original_query>\\n[Column Clarification: term=\\"<term>\\", chosen=\\"<chosen>\\"]"``.

    Otherwise return ``text`` unchanged.

    The original query string is preserved verbatim — no word substitution,
    no case folding, no string replaceAll. The marker is the only new
    content, and it is appended, never interleaved.

    The helper is intentionally idempotent: once a marker is present, the
    text no longer matches the clarification sentence regex, so re-running
    the helper is a no-op. This prevents the runaway text growth that the
    legacy implementation caused when a user clicked the same candidate
    more than once.
    """
    parsed = _parse_clarification_sentence(text)
    if not parsed:
        return text
    original_query, term, chosen = parsed
    # Escape any embedded quotes so the marker stays parseable.
    safe_term = term.replace('"', '\\"')
    safe_chosen = chosen.replace('"', '\\"')
    marker = f'{_CLARIFICATION_MARKER_PREFIX}: term="{safe_term}", chosen="{safe_chosen}"]'
    return f"{original_query}\n{marker}"


def _normalize_nl2sql_query(query: str) -> str:
    """Rewrite common natural-language filter phrasing into explicit SQL-friendly hints."""
    q = (query or "").strip()
    q_lower = q.lower()

    # Parenthetical scoped filters: Category(Furniture) -> explicit equality instruction.
    parenthetical_filters = re.findall(
        r"\b([a-zA-Z][a-zA-Z0-9_\-\s]{1,40})\s*\(\s*([^)]+?)\s*\)",
        q,
    )
    for key, value in parenthetical_filters:
        key_clean = re.sub(r"\s+", " ", key.strip())
        value_clean = re.sub(r"\s+", " ", value.strip())
        if key_clean and value_clean:
            q += f" Treat {key_clean}({value_clean}) as a strict filter where {key_clean} equals '{value_clean}'."

    exclusion_match = re.search(
        r"\b(?:exclude|excluding|without|not including)\s+(?:the\s+)?([a-zA-Z0-9_\-\s]+?)(?:\s+from\b|\s+in\b|\s+category\b|\s+categories\b|$)",
        q_lower,
    )
    if exclusion_match:
        excluded_value = re.sub(r"\s+", " ", exclusion_match.group(1).strip())
        if excluded_value and excluded_value not in {"category", "categories"}:
            q += (
                f" Apply a filter before aggregation: exclude rows where category contains '{excluded_value}'."
            )

    # Comparator normalization: "sales less than 1000 and orders less than 3" -> explicit numeric filter intent.
    if re.search(r"\b(where|and)\b", q_lower) and re.search(
        r"\b(less than|greater than|under|below|over|above|at least|at most|<=|>=|<|>)\b",
        q_lower,
    ):
        q += " Apply all numeric filter conditions before aggregation; combine them with AND unless specified otherwise."

    return q


def _explicitly_requests_visual(query: str) -> bool:
    """Detect whether user explicitly asks for chart/graph output."""
    q = (query or "").lower()
    visual_keywords = [
        "chart", "graph", "plot", "visualize", "visualisation", "visualization",
        "dashboard", "pie", "bar", "line", "scatter", "heatmap", "show as",
    ]
    return any(k in q for k in visual_keywords)


def _is_schema_columns_query(query: str) -> bool:
    """Detect column/schema discovery prompts that should be answered as text."""
    q = (query or "").lower().strip()
    if not q:
        return False

    schema_terms = [
        "column", "columns", "field", "fields", "schema", "header", "headers", "attributes",
    ]
    intent_terms = [
        "what are", "which", "list", "show", "available", "present", "in dataset", "in the dataset",
        "dataset has", "table has", "names",
    ]

    has_schema_term = any(term in q for term in schema_terms)
    has_intent_term = any(term in q for term in intent_terms)
    return has_schema_term and has_intent_term


def _read_dataset_columns(data_path: str) -> List[str]:
    """Load column names from dataset file with a safe CSV fallback."""
    columns: List[str] = []

    try:
        import pandas as pd

        preview = pd.read_csv(data_path, nrows=0)
        columns = [str(col).strip() for col in preview.columns if str(col).strip()]
        if columns:
            return columns
    except Exception:
        pass

    try:
        with open(data_path, "r", newline="", encoding="utf-8") as handle:
            reader = csv.reader(handle)
            header = next(reader, [])
            columns = [str(col).strip() for col in header if str(col).strip()]
    except Exception:
        return []

    return columns


def _build_columns_response(columns: List[str]) -> str:
    """Format schema column names as concise, readable text."""
    if not columns:
        return "I could not read the dataset columns right now. Please try again after reloading the dataset."

    max_preview = 40
    preview = columns[:max_preview]
    lines = [f"{idx + 1}. {name}" for idx, name in enumerate(preview)]
    remaining = len(columns) - len(preview)

    response = [f"Available columns ({len(columns)} total):", "", *lines]
    if remaining > 0:
        response.extend(["", f"...and {remaining} more columns."])

    response.extend([
        "",
        "Ask a metric question like \"top 10 products by revenue\" when you want a chart or KPI.",
    ])

    return "\n".join(response)


def _normalize_orchestrator_response(result: dict, default_intent: str = "analysis") -> tuple[str, str, Optional[dict]]:
    """Support both legacy and new orchestrator response shapes."""
    assistant_content = result.get("message") or result.get("content") or "Here is your analysis."
    metadata = result.get("metadata", {}) if isinstance(result.get("metadata"), dict) else {}
    raw_intent_type = result.get("intent_type") or metadata.get("intent_type") or default_intent

    # Canonicalize orchestrator analytical labels so chat UI chart rendering works.
    intent_map = {
        "comparative": "analysis",
        "aggregative": "analysis",
        "trend": "analysis",
        "retrieval": "text_query",
        "ambiguous": "clarification",
    }
    intent_type = intent_map.get(str(raw_intent_type).lower(), raw_intent_type)

    output_data = result.get("output_data") or result.get("dashboard") or result.get("chart") or result.get("data")
    return assistant_content, intent_type, output_data


def _normalize_query_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _remember_query(session_id: UUID, query: str) -> None:
    sid = str(session_id)
    _SESSION_QUERY_INDEX.setdefault(sid, set()).add(_normalize_query_text(query))


def _index_queries_from_messages(session_id: UUID, messages: List[Any]) -> None:
    sid = str(session_id)
    bucket = _SESSION_QUERY_INDEX.setdefault(sid, set())
    for msg in messages:
        role = getattr(getattr(msg, "role", None), "value", str(getattr(msg, "role", ""))).lower()
        if role == "user":
            bucket.add(_normalize_query_text(getattr(msg, "content", "")))
    _SESSION_INDEX_WARMED.add(sid)


def _should_attempt_replay_lookup(session_id: UUID, message_count: int, normalized_query: str) -> bool:
    """Cheap pre-check before hitting DB for replay lookup."""
    if message_count < 2:
        return False

    sid = str(session_id)

    # Fast path: we have seen this exact query in the current process.
    if normalized_query in _SESSION_QUERY_INDEX.get(sid, set()):
        return True

    # One-time warm-up per session after restart to avoid permanent false negatives.
    if sid not in _SESSION_INDEX_WARMED:
        return True

    return False


def _find_prior_exact_answer(messages: List[Any], query: str) -> Tuple[Optional[str], Optional[dict], Optional[str]]:
    """Find the latest assistant response paired with an identical user query in this session."""
    target = _normalize_query_text(query)
    matched: Tuple[Optional[str], Optional[dict], Optional[str]] = (None, None, None)

    for idx in range(len(messages) - 1):
        user_msg = messages[idx]
        assistant_msg = messages[idx + 1]

        user_role = getattr(getattr(user_msg, "role", None), "value", str(getattr(user_msg, "role", ""))).lower()
        assistant_role = getattr(getattr(assistant_msg, "role", None), "value", str(getattr(assistant_msg, "role", ""))).lower()

        if user_role != "user" or assistant_role != "assistant":
            continue

        if _normalize_query_text(getattr(user_msg, "content", "")) != target:
            continue

        matched = (
            getattr(assistant_msg, "content", None),
            getattr(assistant_msg, "output_data", None),
            getattr(assistant_msg, "intent_type", None),
        )

    return matched


def _ensure_point_style(text: str, min_points: int = 6, max_points: int = 8) -> str:
    """Convert paragraph responses to stable bullet points while preserving wording."""
    raw = (text or "").strip()
    if not raw:
        return raw

    def _norm_point(s: str) -> str:
        return re.sub(r"^([-*•]|\d+[.)])\s+", "", (s or "").strip()).strip().lower()

    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    extracted: List[str] = []

    for ln in lines:
        m = re.match(r"^([-*•]|\d+[.)])\s+(.*)$", ln)
        if m:
            extracted.append(m.group(2).strip())

    # If still no extracted lines, treat any sufficiently long text chunk as a line
    if not extracted and lines:
        extracted = [ln for ln in lines if len(ln) > 10]

    if not extracted:
        sentences = re.split(r"(?<=[.!?])\s+", raw.replace("\n", " "))
        extracted = [s.strip() for s in sentences if s.strip()]

    seen_norm = {_norm_point(item) for item in extracted if item.strip()}

    # Prefer richer output when source has enough sentence granularity.
    extracted = extracted[:max_points] if extracted else [raw]
    if len(extracted) < min_points and len(lines) > len(extracted):
        for ln in lines:
            if len(extracted) >= min_points:
                break
            norm_ln = _norm_point(ln)
            if norm_ln and norm_ln not in seen_norm:
                extracted.append(ln)
                seen_norm.add(norm_ln)

    return "\n\n".join(f"{idx + 1}. {p}" for idx, p in enumerate(extracted[:max_points]))


def _extract_diagnostic_sql_queries(orch_output: Optional[dict]) -> List[dict]:
    """Extract SQL snippets for interpretive diagnostics from orchestrator payloads."""
    if not isinstance(orch_output, dict):
        return []

    candidates = orch_output.get("diagnostic_sql_queries")
    if not isinstance(candidates, list):
        diagnostics = orch_output.get("diagnostics")
        candidates = diagnostics if isinstance(diagnostics, list) else []

    sql_queries: List[dict] = []
    for idx, item in enumerate(candidates):
        if not isinstance(item, dict):
            continue

        sql = item.get("sql")
        if not isinstance(sql, str) or not sql.strip():
            continue

        entry = {
            "id": str(item.get("id") or f"diag_{idx + 1}"),
            "title": str(item.get("title") or f"Diagnostic {idx + 1}"),
            "sql": sql.strip(),
        }

        dimension = item.get("dimension")
        if isinstance(dimension, str) and dimension.strip():
            entry["dimension"] = dimension

        row_count = item.get("row_count")
        if isinstance(row_count, int):
            entry["row_count"] = row_count
        elif isinstance(item.get("data"), list):
            entry["row_count"] = len(item.get("data") or [])

        sql_queries.append(entry)

    return sql_queries


# =============================================================================
# Request/Response Schemas
# =============================================================================


class CreateSessionRequest(BaseModel):
    """Request to create a new chat session."""
    dataset_id: Optional[UUID] = None
    dataset_version_id: Optional[UUID] = None
    title: Optional[str] = None


class UpdateSessionRequest(BaseModel):
    """Request to update session title."""
    title: str = Field(..., min_length=1, max_length=255)


class SendMessageRequest(BaseModel):
    """Request to send a message in a chat session."""
    content: str = Field(..., min_length=1, max_length=5000)
    force_deep_analysis: bool = Field(default=False)
    enable_suggestions: bool = Field(default=False)
    compile_visual_only: bool = Field(default=False)


class MessageResponse(BaseModel):
    """Response for a single message."""
    id: UUID
    role: str
    content: str
    output_data: Optional[dict] = None
    intent_type: Optional[str] = None
    sequence: int

    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    """Response for a chat session."""
    id: UUID
    user_id: UUID
    dataset_id: Optional[UUID] = None
    title: str
    message_count: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatResponse(BaseModel):
    """Response after sending a message."""
    user_message: MessageResponse
    assistant_message: MessageResponse


class SessionListResponse(BaseModel):
    """Response for listing sessions."""
    sessions: List[SessionResponse]


class MessageListResponse(BaseModel):
    """Response for listing messages."""
    messages: List[MessageResponse]


# =============================================================================
# Session Routes
# =============================================================================


@router.post(
    "/sessions",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new chat session",
)
def create_session(
    request: CreateSessionRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> SessionResponse:
    """
    Create a new chat session.
    
    Optionally tie to a dataset for context-aware conversations.
    """
    chat_session = chat_service.create_chat_session(
        session=session,
        user_id=UUID(current_user.user_id),
        dataset_id=request.dataset_id,
        dataset_version_id=request.dataset_version_id,
        title=request.title,
    )
    return SessionResponse.model_validate(chat_session)


@router.get(
    "/sessions",
    response_model=SessionListResponse,
    summary="List all chat sessions",
)
def list_sessions(
    session: DBSession,
    current_user: AuthenticatedUser,
    limit: int = 50,
) -> SessionListResponse:
    """
    List all chat sessions for the current user.
    """
    sessions = chat_service.list_user_sessions(
        session=session,
        user_id=UUID(current_user.user_id),
        limit=limit,
    )
    return SessionListResponse(
        sessions=[SessionResponse.model_validate(s) for s in sessions]
    )


@router.get(
    "/sessions/{session_id}",
    response_model=SessionResponse,
    summary="Get a chat session",
)
def get_session(
    session_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> SessionResponse:
    """
    Get a specific chat session.
    """
    try:
        chat_session = chat_service.get_chat_session(
            session=session,
            session_id=session_id,
            user_id=UUID(current_user.user_id),
        )
        return SessionResponse.model_validate(chat_session)
    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)
    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)


@router.patch(
    "/sessions/{session_id}",
    response_model=SessionResponse,
    summary="Update session title",
)
def update_session(
    session_id: UUID,
    request: UpdateSessionRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> SessionResponse:
    """
    Update the title of a chat session.
    """
    try:
        chat_session = chat_service.update_session_title(
            session=session,
            session_id=session_id,
            user_id=UUID(current_user.user_id),
            title=request.title,
        )
        return SessionResponse.model_validate(chat_session)
    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)
    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a chat session",
)
async def delete_session(
    session_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> None:
    """
    Delete (soft-delete) a chat session.

    The handler must invoke ``chat_service.delete_chat_session``; otherwise
    the row stays in the DB with ``is_active=True`` and the
    ``GET /chat/sessions`` list endpoint (which filters by ``is_active=True``)
    keeps returning the "deleted" session — so it reappears in the UI on
    the next page refresh. Returning 204 here without doing the soft-delete
    was a real bug; the regression is guarded by
    ``tests/test_chat_session_delete.py``.
    """
    try:
        chat_session = chat_service.get_chat_session(
            session=session,
            session_id=session_id,
            user_id=UUID(current_user.user_id),
        )

        # Dataset ownership verification (if session is tied to a dataset)
        if chat_session.dataset_id:
            from app.api.deps import verify_dataset_owner
            await verify_dataset_owner(
                dataset_id=chat_session.dataset_id,
                session=session,
                current_user=current_user
            )

        # Soft-delete the session row (sets is_active=False). Done after
        # ownership checks so an unauthorised request cannot mutate state.
        chat_service.delete_chat_session(
            session=session,
            session_id=session_id,
            user_id=UUID(current_user.user_id),
        )

    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)
    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)


# =============================================================================
# Message Routes
# =============================================================================


@router.get(
    "/sessions/{session_id}/messages",
    response_model=MessageListResponse,
    summary="Get all messages in a session",
)
def get_messages(
    session_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
    limit: int = 100,
) -> MessageListResponse:
    """
    Get all messages in a chat session.
    """
    try:
        messages = chat_service.get_session_messages(
            session=session,
            session_id=session_id,
            user_id=UUID(current_user.user_id),
            limit=limit,
        )
        return MessageListResponse(
            messages=[MessageResponse.model_validate(m) for m in messages]
        )
    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)
    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)


@router.post(
    "/sessions/{session_id}/messages",
    response_model=ChatResponse,
    summary="Send a message and get AI response",
)
async def send_message(
    session_id: UUID,
    request: SendMessageRequest,
    session: DBSession,
    current_user: RateLimitedUser,
) -> ChatResponse:
    """
    Send a message to the chat and get AI response.
    
    Pipeline (Intent-Based Routing):
    1. Save user message
    2. Detect intent: dashboard | chart/text
    3. Dashboard → legacy orchestrator (multi-widget generation)
    4. Chart/Text → NL2SQL engine → chart spec builder
    5. Fallback to legacy orchestrator if NL2SQL fails
    6. Apply memory management (token compression)
    7. Save and return assistant response
    """
    try:
        # Get session and validate ownership
        chat_session = chat_service.get_chat_session(
            session=session,
            session_id=session_id,
            user_id=UUID(current_user.user_id),
        )
        
        # Dataset ownership verification (if session is tied to a dataset)
        if chat_session.dataset_id:
            from app.api.deps import verify_dataset_owner
            await verify_dataset_owner(
                dataset_id=chat_session.dataset_id,
                session=session,
                current_user=current_user
            )
        
        has_dataset_attached = bool(chat_session.dataset_version_id)


        # Pre-process query if it is a clarification sentence.
        # The legacy implementation did a global regex substitution on the
        # original query (\b<term>\b → <chosen>), which produced runaway
        # text growth when the chosen column already contained the term
        # (e.g. "Name" inside "Product Name" → "Product Product Name").
        # The new helper preserves the original query verbatim and emits a
        # structured [Column Clarification] marker that the executor uses
        # to seed a forced hint and skip the ambiguity re-check.
        query_text = _rewrite_clarification_query(request.content)

        # Deterministic replay with pre-check: only hit DB when replay is likely.
        normalized_query = _normalize_query_text(query_text)
        cached_content, cached_output, cached_intent = (None, None, None)
        if has_dataset_attached and _should_attempt_replay_lookup(chat_session.id, chat_session.message_count, normalized_query):
            session_messages = chat_service.get_session_messages(
                session=session,
                session_id=session_id,
                user_id=UUID(current_user.user_id),
                limit=50,
            )
            _index_queries_from_messages(chat_session.id, session_messages)
            cached_content, cached_output, cached_intent = _find_prior_exact_answer(session_messages, query_text)

        # Add user message
        user_msg = chat_service.add_user_message(
            session=session,
            session_id=session_id,
            user_id=UUID(current_user.user_id),
            content=request.content,
        )
        _remember_query(chat_session.id, query_text)

        # Auto-generate title from first message
        if chat_session.message_count == 1:
            chat_service.auto_generate_title(
                session=session,
                session_id=session_id,
                first_message=request.content,
            )

        is_interpretive_query = _looks_interpretive_query(query_text)
        is_schema_columns_query = _is_schema_columns_query(query_text) and not _explicitly_requests_visual(query_text)

        if cached_content:
            if is_interpretive_query:
                cached_is_interpretive = (
                    (cached_intent == "interpretive")
                    or (
                        isinstance(cached_output, dict)
                        and (
                            cached_output.get("type") in {"interpretive", "interpretive_text"}
                            or cached_output.get("source") == "orchestrator_interpretive"
                            or cached_output.get("detected_intent") == "interpretive"
                        )
                    )
                )
                # Skip replay for old KPI/chart answers so the new interpretive path can run.
                if not cached_is_interpretive:
                    cached_content = None
                    cached_output = None
                    cached_intent = None

            if cached_content and is_schema_columns_query:
                cached_has_visual_payload = isinstance(cached_output, dict) and (
                    cached_output.get("chart") is not None
                    or cached_output.get("type") == "kpi"
                    or cached_output.get("response_type") == "chart"
                )
                if cached_has_visual_payload:
                    cached_content = None
                    cached_output = None
                    cached_intent = None

            if cached_content and is_interpretive_query:
                cached_content = _ensure_point_style(cached_content, min_points=6, max_points=8)

            replay_output = cached_output.copy() if isinstance(cached_output, dict) else cached_output
            if isinstance(replay_output, dict):
                replay_output["reused_response"] = True

            if cached_content:
                assistant_msg = chat_service.add_assistant_message(
                    session=session,
                    session_id=session_id,
                    content=cached_content,
                    output_data=replay_output,
                    intent_type=cached_intent,
                )

                return ChatResponse(
                    user_message=MessageResponse.model_validate(user_msg),
                    assistant_message=MessageResponse.model_validate(assistant_msg),
                )

        # Run analysis if dataset is attached
        if has_dataset_attached:
            force_nl2sql = getattr(request, "compile_visual_only", False)
            if force_nl2sql:
                is_dashboard = False
                interpretive_text_mode = False
                is_schema_columns_query = False
            else:
                # ── Intent Detection (6-type heuristic) ──
                detected_intent, intent_confidence, intent_label = classify_intent_fast(query_text)
                is_dashboard = detected_intent == 'dashboard'
                interpretive_text_mode = (_looks_interpretive_query(query_text) and not _explicitly_requests_visual(query_text))

            if is_schema_columns_query:
                from app.models.dataset_version import DatasetVersion

                version = session.get(DatasetVersion, chat_session.dataset_version_id)
                data_path = (version.cleaned_reference or version.source_reference) if version else None
                columns = _read_dataset_columns(data_path) if data_path else []

                assistant_content = _build_columns_response(columns)
                intent_type = "text_query"
                output_data = None

            elif is_dashboard:
                # ══════════════════════════════════════════════════
                # DASHBOARD → Legacy Orchestrator (multi-widget)
                # ══════════════════════════════════════════════════
                result = await run_analysis_orchestration(
                    session=session,
                    dataset_version_id=chat_session.dataset_version_id,
                    user_id=UUID(current_user.user_id),
                    role=current_user.role,
                    query=query_text,
                )

                assistant_content, intent_type, output_data = _normalize_orchestrator_response(result, default_intent="dashboard")
                if output_data and isinstance(output_data, dict):
                    output_data["detected_intent"] = intent_label

                # If user explicitly requested a visual, keep chat in chart-renderable mode.
                if _explicitly_requests_visual(query_text) and intent_type in {"text_query", "retrieval"}:
                    intent_type = "analysis"

            elif interpretive_text_mode:
                # ══════════════════════════════════════════════════
                # WHY/EXPLAIN (text-first) → Orchestrator Interpretive Path
                # ══════════════════════════════════════════════════
                result = await run_analysis_orchestration(
                    session=session,
                    dataset_version_id=chat_session.dataset_version_id,
                    user_id=UUID(current_user.user_id),
                    role=current_user.role,
                    query=query_text,
                    force_deep_analysis=request.force_deep_analysis,
                )

                assistant_content, intent_type, orch_output = _normalize_orchestrator_response(result, default_intent="interpretive")
                assistant_content = _ensure_point_style(assistant_content, min_points=6, max_points=8)

                # DA-first UX: for explanatory questions, always return textual narrative unless visual was explicitly requested.
                output_data = {
                    "type": "interpretive_text",
                    "response_type": "text",
                    "detected_intent": intent_label,
                    "source": "orchestrator_interpretive",
                }
                if isinstance(orch_output, dict):
                    diag_count = orch_output.get("diagnostics_count")
                    if isinstance(diag_count, int):
                        output_data["diagnostics_count"] = diag_count
                    grounding_mode = orch_output.get("grounding_mode")
                    if isinstance(grounding_mode, str) and grounding_mode:
                        output_data["grounding_mode"] = grounding_mode
                    evidence_quality = orch_output.get("evidence_quality")
                    if isinstance(evidence_quality, dict):
                        output_data["evidence_quality"] = evidence_quality
                    insufficient_evidence = orch_output.get("insufficient_evidence")
                    if isinstance(insufficient_evidence, bool):
                        output_data["insufficient_evidence"] = insufficient_evidence

                    diagnostic_sql_queries = _extract_diagnostic_sql_queries(orch_output)
                    if diagnostic_sql_queries:
                        output_data["diagnostic_sql_queries"] = diagnostic_sql_queries
                if result.get("staleness_warning"):
                    output_data["staleness_warning"] = result.get("staleness_warning")

            else:
                # ══════════════════════════════════════════════════
                # CHART / TEXT / KPI → NL2SQL Engine (Primary)
                # ══════════════════════════════════════════════════
                nl2sql_result = None
                db_engine = None

                try:
                    import pandas as pd
                    from app.models.dataset_version import DatasetVersion
                    from app.services.analytics.db_engine import DBEngine
                    from app.services.analytics.executor import Executor
                    from app.services.llm.memory_manager import MemoryManager
                    from app.services.visualization.nl2sql_chart_builder import build_chart_from_nl2sql

                    # Load dataset
                    version = session.get(DatasetVersion, chat_session.dataset_version_id)
                    if version:
                        from app.services.analytics.table_resolver import resolve_table_name_from_version
                        from app.core.storage import get_duckdb_path

                        table_name = resolve_table_name_from_version(version)
                        duckdb_path = get_duckdb_path(version.dataset_id, version.id)

                        if get_storage().exists(duckdb_path):
                            db_engine = DBEngine(db_path=str(duckdb_path), read_only=True)
                            db_engine._lock_down_read_con()
                        else:
                            data_path = version.cleaned_reference or version.source_reference
                            
                            # Initialize DuckDB engine
                            db_engine = DBEngine()
                            
                            from app.services.storage import get_storage
                            local_csv_path = get_storage().download_to_temp(data_path)
                            try:
                                try:
                                    await db_engine.load_csv(table_name, local_csv_path, storage_key=data_path)
                                except Exception as csv_err:
                                    logging.getLogger(__name__).warning(f"Direct CSV load failed, falling back to Pandas: {csv_err}")
                                    df = pd.read_csv(local_csv_path)
                                    await db_engine.load_dataframe(table_name, df)
                            finally:
                                get_storage().cleanup_temp(local_csv_path)

                        # Apply memory management
                        context_messages = chat_service.get_recent_context(
                            session=session,
                            session_id=session_id,
                            max_messages=5,
                        )
                        memory = MemoryManager()
                        if memory.should_summarize(context_messages):
                            context_messages = await memory.summarize(context_messages)

                        context_prefix = ""
                        if context_messages:
                            history = "\n".join(
                                f"{m['role'].upper()}: {m['content']}" for m in context_messages[:-1]
                            )
                            if history:
                                context_prefix = f"[Conversation Context]:\n{history}\n\n"

                        normalized_query = _normalize_nl2sql_query(query_text)
                        contextual_query = f"{context_prefix}[Current Question]: {normalized_query}"

                        # Execute via self-healing NL2SQL engine
                        executor = Executor()
                        nl2sql_result = await executor.run_query(
                            user_query=contextual_query,
                            db=db_engine,
                            table_name=table_name,
                            force_deep_analysis=request.force_deep_analysis
                        )

                except Exception as e:
                    logger.warning(f"NL2SQL engine error: {e}")
                    nl2sql_result = None
                finally:
                    if db_engine is not None:
                        db_engine.close()

                # ── Use NL2SQL result if successful ──
                if nl2sql_result and nl2sql_result.get("success"):
                    logger.info(f"NL2SQL Engine Success: Generated SQL '{nl2sql_result.get('sql')}'")
                    chart_type = nl2sql_result.get("chart_type", "table")
                    timing = nl2sql_result.get("timing", {})

                    # Build proper chart spec from raw NL2SQL data
                    chart_output = build_chart_from_nl2sql(nl2sql_result)
                    chart_spec = chart_output.get("chart", {})
                    explanation = chart_output.get("explanation", {})
                    followups = chart_output.get("followup_suggestions", [])

                    # Use resolved/upgraded chart type from the chart spec
                    chart_type = chart_spec.get("type", chart_type)

                    if chart_type == "kpi":
                        kpi_value = chart_spec.get("data", {}).get("value", "")
                        kpi_label = chart_spec.get("data", {}).get("label", "Result")
                        if _is_percentage_kpi(kpi_label, chart_spec):
                            formatted_val = _format_percentage_value(kpi_value)
                        else:
                            is_currency_kpi = _is_currency_kpi(kpi_label, chart_spec)
                            currency_symbol = _kpi_currency_symbol(chart_spec)
                            formatted_val = _format_compact_value(kpi_value, is_currency=is_currency_kpi, currency_symbol=currency_symbol)
                        numbered_summary = _build_numbered_metric_summary(
                            nl2sql_result.get("data", []),
                            nl2sql_result.get("columns", []),
                            nl2sql_result.get("column_metadata", {}),
                        )
                        
                        assistant_content = (
                            numbered_summary
                            or explanation.get("summary", "")
                            or f"**{kpi_label}:** {formatted_val}"
                        )
                        intent_type = "text_query"
                        output_data = {
                            "type": "nl2sql",
                            "response_type": "text",
                            "chart": chart_spec,
                            "data": chart_spec.get("data"),
                            "sql": nl2sql_result.get("sql", ""),
                            "timing": timing,
                            "detected_intent": intent_label,
                            "followup_suggestions": followups,
                        }
                    else:
                        assistant_content = explanation.get("summary", "Here is your analysis.")
                        key_insight = explanation.get("key_insight", "")
                        if key_insight:
                            assistant_content = f"{assistant_content}\n\n**Key Insight:** {key_insight}"

                        intent_type = "analysis"
                        output_data = {
                            "type": "nl2sql",
                            "response_type": "chart",
                            "chart": chart_spec,
                            "explanation": explanation,
                            "sql": nl2sql_result.get("sql", ""),
                            "timing": timing,
                            "detected_intent": intent_label,
                            "followup_suggestions": followups,
                        }

                elif nl2sql_result and nl2sql_result.get("ambiguity"):
                    # ── Ambiguity Clarification ──
                    ambiguity = nl2sql_result["ambiguity"]
                    term = ambiguity.get("term", "")
                    candidates = ambiguity.get("candidates", [])
                    question = ambiguity.get("question", f"Which '{term}' column did you mean?")

                    assistant_content = f"Your query mentions **\"{term}\"** which could refer to multiple columns. Please select the one you meant:"
                    intent_type = "clarification"
                    output_data = {
                        "type": "clarification",
                        "ambiguity": {
                            "term": term,
                            "candidates": candidates,
                            "question": question,
                            "original_query": query_text,
                        },
                        "timing": nl2sql_result.get("timing", {}),
                        "detected_intent": intent_label,
                    }

                else:
                    # ── NL2SQL failed — surface diagnostics then fallback ──
                    diagnostics = nl2sql_result.get("diagnostics") if nl2sql_result else None
                    failed_timing = nl2sql_result.get("timing") if nl2sql_result else None
                    reason = nl2sql_result.get("error") if nl2sql_result else "Unknown crash"
                    logger.warning(f"NL2SQL Engine failed ({reason}). Falling back to Legacy Orchestrator.")

                    result = await run_analysis_orchestration(
                        session=session,
                        dataset_version_id=chat_session.dataset_version_id,
                        user_id=UUID(current_user.user_id),
                        role=current_user.role,
                        query=query_text,
                    )

                    assistant_content, intent_type, output_data = _normalize_orchestrator_response(result)

                    if _explicitly_requests_visual(query_text) and intent_type in {"text_query", "retrieval"}:
                        intent_type = "analysis"

                    # Attach diagnostics for the frontend to optionally display
                    if output_data and isinstance(output_data, dict) and diagnostics:
                        output_data["nl2sql_diagnostics"] = diagnostics
                        output_data["nl2sql_timing"] = failed_timing
                        output_data["detected_intent"] = intent_label


        else:
            # No dataset - do not replay or generate analytics values.
            if _is_simple_chat_query(query_text):
                assistant_content = _build_simple_chat_response(query_text, has_dataset=False)
            else:
                assistant_content = "Please select and attach a dataset to this conversation before running analytics queries."
            output_data = None
            intent_type = None

        # Component 3: Search mode / context-aware suggestions
        if request.enable_suggestions and has_dataset_attached:
            try:
                contract = session.exec(
                    select(AnalysisContract).where(
                        AnalysisContract.dataset_version_id == chat_session.dataset_version_id,
                        AnalysisContract.is_active == True,
                    )
                ).first()
                schema_dict = {}
                if contract:
                    schema_dict = {
                        "allowed_metrics": contract.allowed_metrics,
                        "allowed_dimensions": contract.allowed_dimensions,
                        "target_column": getattr(contract, 'target_column', None)
                    }
                recent_messages = chat_service.get_recent_context(
                    session=session,
                    session_id=session_id,
                    max_messages=5,
                )
                from app.services.llm.suggestion_generator import generate_contextual_suggestions
                suggestions = await generate_contextual_suggestions(
                    schema=schema_dict,
                    conversation_history=recent_messages,
                    latest_result=output_data,
                )
                if not isinstance(output_data, dict):
                    output_data = {}
                output_data["followup_suggestions"] = suggestions
            except Exception as sug_err:
                logger.error(f"Failed to generate contextual suggestions in send_message: {sug_err}")

        # Add assistant message
        assistant_msg = chat_service.add_assistant_message(
            session=session,
            session_id=session_id,
            content=assistant_content,
            output_data=output_data,
            intent_type=intent_type,
        )

        return ChatResponse(
            user_message=MessageResponse.model_validate(user_msg),
            assistant_message=MessageResponse.model_validate(assistant_msg),
        )

    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)
    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)
    except InvalidOperation as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.post(
    "/sessions/{session_id}/messages/stream",
    summary="Send a message and stream progress events",
)
async def send_message_stream(
    session_id: UUID,
    request: SendMessageRequest,
    session: DBSession,
    current_user: RateLimitedUser,
):
    """
    SSE stream message response. Works concurrently to push steps and diagnostics 
    while computing.
    """
    from fastapi.responses import StreamingResponse
    import json
    import asyncio

    try:
        chat_session = chat_service.get_chat_session(
            session=session,
            session_id=session_id,
            user_id=UUID(current_user.user_id),
        )
    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)
    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)

    async def event_generator():
        queue = asyncio.Queue()

        from datetime import timezone as _tz
        thought_counter = [0]

        async def emit_thought(content: str):
            thought_counter[0] += 1
            await queue.put(("thought", {
                "id": thought_counter[0],
                "content": content,
                "timestamp": datetime.now(_tz.utc).isoformat(),
            }))

        async def progress_callback(progress_data: dict):
            await queue.put(("progress", progress_data))
            detail = progress_data.get("detail", "")
            if detail:
                await emit_thought(f"{detail}")

        task = None
        try:
            async def run_pipeline():
                try:
                    # 1. Add user message
                    user_msg = chat_service.add_user_message(
                        session=session,
                        session_id=session_id,
                        user_id=UUID(current_user.user_id),
                        content=request.content,
                    )
                    
                    if chat_session.message_count == 1:
                        chat_service.auto_generate_title(
                            session=session,
                            session_id=session_id,
                            first_message=request.content,
                        )

                    # 2. Run analysis orchestration
                    has_dataset_attached = bool(chat_session.dataset_version_id)
                    assistant_content = ""
                    intent_type = None
                    output_data = None

                    if has_dataset_attached:
                        # Apply the same clarification pre-process used on
                        # the non-streaming path so a streamed clarification
                        # click is also handled consistently.
                        query_text = _rewrite_clarification_query(request.content)
                        
                        force_nl2sql = getattr(request, "compile_visual_only", False)
                        if force_nl2sql:
                            is_dashboard = False
                            interpretive_text_mode = False
                            is_schema_columns_query = False
                        else:
                            detected_intent, intent_confidence, intent_label = classify_intent_fast(query_text)
                            clean_label = intent_label.replace('🎯 ', '').replace('📊 ', '').replace('📈 ', '').replace('🔍 ', '').strip()
                            await emit_thought(f"Classifying query intent: identified as {clean_label.lower()} ({intent_confidence:.0%} confidence)")
                            is_dashboard = detected_intent == 'dashboard'
                            interpretive_text_mode = (_looks_interpretive_query(query_text) and not _explicitly_requests_visual(query_text))
                            is_schema_columns_query = _is_schema_columns_query(query_text) and not _explicitly_requests_visual(query_text)

                        if is_schema_columns_query:
                            await emit_thought("Detected schema/column discovery query \u2014 returning column listing")
                            from app.models.dataset_version import DatasetVersion
                            version = session.get(DatasetVersion, chat_session.dataset_version_id)
                            data_path = (version.cleaned_reference or version.source_reference) if version else None
                            columns = _read_dataset_columns(data_path) if data_path else []
                            assistant_content = _build_columns_response(columns)
                            intent_type = "text_query"
                            output_data = None

                        elif is_dashboard or interpretive_text_mode:
                            await emit_thought(f"Routing to analysis orchestrator" + (" (deep analysis)" if request.force_deep_analysis else ""))
                            result = await run_analysis_orchestration(
                                session=session,
                                dataset_version_id=chat_session.dataset_version_id,
                                user_id=UUID(current_user.user_id),
                                role=current_user.role,
                                query=query_text,
                                force_deep_analysis=request.force_deep_analysis,
                                progress_callback=progress_callback,
                            )

                            if result.get("refused"):
                                assistant_content = result["message"]
                                output_data = {
                                    "refused": True,
                                    "followup_suggestions": result.get("suggestions", [])
                                }
                                intent_type = "error"
                            else:
                                default_intent = "interpretive" if request.force_deep_analysis else "analysis"
                                assistant_content, intent_type, orch_output = _normalize_orchestrator_response(result, default_intent=default_intent)
                                
                                if request.force_deep_analysis:
                                    assistant_content = _ensure_point_style(assistant_content, min_points=6, max_points=8)
                                    output_data = {
                                        "type": "interpretive_text",
                                        "response_type": "text",
                                        "detected_intent": "interpretive",
                                        "source": "orchestrator_interpretive",
                                    }
                                    if isinstance(orch_output, dict):
                                        for k in ["diagnostics_count", "grounding_mode", "evidence_quality", "insufficient_evidence"]:
                                            if k in orch_output:
                                                output_data[k] = orch_output[k]
                                        diagnostic_sql_queries = _extract_diagnostic_sql_queries(orch_output)
                                        if diagnostic_sql_queries:
                                            output_data["diagnostic_sql_queries"] = diagnostic_sql_queries
                                else:
                                    output_data = orch_output

                                if result.get("staleness_warning") and isinstance(output_data, dict):
                                    output_data["staleness_warning"] = result.get("staleness_warning")

                        else:
                            # ══════════════════════════════════════════════════
                            # CHART / TEXT / KPI → NL2SQL Engine (Primary)
                            # ══════════════════════════════════════════════════
                            await emit_thought("Routing to NL2SQL engine for direct query execution")
                            nl2sql_result = None
                            db_engine = None
                            try:
                                import pandas as pd
                                from app.models.dataset_version import DatasetVersion
                                from app.services.analytics.db_engine import DBEngine
                                from app.services.analytics.executor import Executor
                                from app.services.llm.memory_manager import MemoryManager
                                from app.services.visualization.nl2sql_chart_builder import build_chart_from_nl2sql

                                version = session.get(DatasetVersion, chat_session.dataset_version_id)
                                if version:
                                    from app.services.analytics.table_resolver import resolve_table_name_from_version
                                    from app.core.storage import get_duckdb_path

                                    table_name = resolve_table_name_from_version(version)
                                    duckdb_path = get_duckdb_path(version.dataset_id, version.id)

                                    if get_storage().exists(duckdb_path):
                                        db_engine = DBEngine(db_path=str(duckdb_path), read_only=True)
                                        db_engine._lock_down_read_con()
                                        await emit_thought("Loaded dataset")
                                    else:
                                        data_path = version.cleaned_reference or version.source_reference
                                        db_engine = DBEngine()
                                        from app.services.storage import get_storage
                                        local_csv_path = get_storage().download_to_temp(data_path)
                                        try:
                                            try:
                                                await db_engine.load_csv(table_name, local_csv_path, storage_key=data_path)
                                            except Exception as csv_err:
                                                logger.warning(f"Direct CSV load failed, falling back to Pandas: {csv_err}")
                                                df = pd.read_csv(local_csv_path)
                                                await db_engine.load_dataframe(table_name, df)
                                        finally:
                                            get_storage().cleanup_temp(local_csv_path)

                                    context_messages = chat_service.get_recent_context(
                                        session=session,
                                        session_id=session_id,
                                        max_messages=5,
                                    )
                                    memory = MemoryManager()
                                    if memory.should_summarize(context_messages):
                                        context_messages = await memory.summarize(context_messages)

                                    context_prefix = ""
                                    if context_messages:
                                        history = "\n".join(
                                            f"{m['role'].upper()}: {m['content']}" for m in context_messages[:-1]
                                        )
                                        if history:
                                            context_prefix = f"[Conversation Context]:\n{history}\n\n"

                                    normalized_query = _normalize_nl2sql_query(query_text)
                                    contextual_query = f"{context_prefix}[Current Question]: {normalized_query}"

                                    executor = Executor()
                                    nl2sql_result = await executor.run_query(
                                        user_query=contextual_query,
                                        db=db_engine,
                                        table_name=table_name,
                                        progress_callback=progress_callback,
                                        force_deep_analysis=request.force_deep_analysis
                                    )
                            except Exception as e:
                                logger.warning(f"NL2SQL engine error in stream: {e}")
                                nl2sql_result = None
                            finally:
                                if db_engine is not None:
                                    db_engine.close()

                            if nl2sql_result and nl2sql_result.get("success"):
                                await emit_thought("SQL query executed successfully")
                                logger.info(f"NL2SQL Engine Success in stream: Generated SQL '{nl2sql_result.get('sql')}'")
                                chart_type = nl2sql_result.get("chart_type", "table")
                                await emit_thought(f"Visualization type: {chart_type}")
                                timing = nl2sql_result.get("timing", {})

                                chart_output = build_chart_from_nl2sql(nl2sql_result)
                                chart_spec = chart_output.get("chart", {})
                                explanation = chart_output.get("explanation", {})
                                followups = chart_output.get("followup_suggestions", [])
                                chart_type = chart_spec.get("type", chart_type)

                                if chart_type == "kpi":
                                    kpi_value = chart_spec.get("data", {}).get("value", "")
                                    kpi_label = chart_spec.get("data", {}).get("label", "Result")
                                    if _is_percentage_kpi(kpi_label, chart_spec):
                                        formatted_val = _format_percentage_value(kpi_value)
                                    else:
                                        is_currency_kpi = _is_currency_kpi(kpi_label, chart_spec)
                                        currency_symbol = _kpi_currency_symbol(chart_spec)
                                        formatted_val = _format_compact_value(kpi_value, is_currency=is_currency_kpi, currency_symbol=currency_symbol)
                                    numbered_summary = _build_numbered_metric_summary(
                                        nl2sql_result.get("data", []),
                                        nl2sql_result.get("columns", []),
                                        nl2sql_result.get("column_metadata", {}),
                                    )
                                    assistant_content = (
                                        numbered_summary
                                        or explanation.get("summary", "")
                                        or f"**{kpi_label}:** {formatted_val}"
                                    )
                                    intent_type = "text_query"
                                    output_data = {
                                        "type": "nl2sql",
                                        "response_type": "text",
                                        "chart": chart_spec,
                                        "data": chart_spec.get("data"),
                                        "sql": nl2sql_result.get("sql", ""),
                                        "timing": timing,
                                        "detected_intent": intent_label,
                                        "followup_suggestions": followups,
                                    }
                                else:
                                    assistant_content = explanation.get("summary", "Here is your analysis.")
                                    key_insight = explanation.get("key_insight", "")
                                    if key_insight:
                                        assistant_content = f"{assistant_content}\n\n**Key Insight:** {key_insight}"

                                    intent_type = "analysis"
                                    output_data = {
                                        "type": "nl2sql",
                                        "response_type": "chart",
                                        "chart": chart_spec,
                                        "explanation": explanation,
                                        "sql": nl2sql_result.get("sql", ""),
                                        "timing": timing,
                                        "detected_intent": intent_label,
                                        "followup_suggestions": followups,
                                    }
                            elif nl2sql_result and nl2sql_result.get("ambiguity"):
                                ambiguity = nl2sql_result["ambiguity"]
                                term = ambiguity.get("term", "")
                                candidates = ambiguity.get("candidates", [])
                                question = ambiguity.get("question", f"Which '{term}' column did you mean?")

                                assistant_content = f"Your query mentions **\"{term}\"** which could refer to multiple columns. Please select the one you meant:"
                                intent_type = "clarification"
                                output_data = {
                                    "type": "clarification",
                                    "ambiguity": {
                                        "term": term,
                                        "candidates": candidates,
                                        "question": question,
                                        "original_query": query_text,
                                    },
                                    "timing": nl2sql_result.get("timing", {}),
                                    "detected_intent": intent_label,
                                }
                            else:
                                # Fallback to Legacy Orchestrator
                                diagnostics = nl2sql_result.get("diagnostics") if nl2sql_result else None
                                failed_timing = nl2sql_result.get("timing") if nl2sql_result else None
                                reason = nl2sql_result.get("error") if nl2sql_result else "Unknown crash"
                                await emit_thought("Primary engine failed \u2014 falling back to legacy orchestrator")
                                logger.warning(f"NL2SQL Engine failed ({reason}). Falling back to Legacy Orchestrator in Stream.")

                                result = await run_analysis_orchestration(
                                    session=session,
                                    dataset_version_id=chat_session.dataset_version_id,
                                    user_id=UUID(current_user.user_id),
                                    role=current_user.role,
                                    query=query_text,
                                )

                                assistant_content, intent_type, output_data = _normalize_orchestrator_response(result)
                                if _explicitly_requests_visual(query_text) and intent_type in {"text_query", "retrieval"}:
                                    intent_type = "analysis"

                                if output_data and isinstance(output_data, dict) and diagnostics:
                                    output_data["nl2sql_diagnostics"] = diagnostics
                                    output_data["nl2sql_timing"] = failed_timing
                                    output_data["detected_intent"] = intent_label
                    else:
                        await emit_thought("No dataset attached \u2014 returning guidance message")
                        if _is_simple_chat_query(request.content):
                            assistant_content = _build_simple_chat_response(request.content, has_dataset=False)
                        else:
                            assistant_content = "Please select and attach a dataset to this conversation before running analytics queries."
                        output_data = None
                        intent_type = None

                    # Suggestions for Search mode
                    if request.enable_suggestions and has_dataset_attached:
                        await emit_thought("Generating contextual follow-up suggestions")
                        try:
                            contract = session.exec(
                                select(AnalysisContract).where(
                                    AnalysisContract.dataset_version_id == chat_session.dataset_version_id,
                                    AnalysisContract.is_active == True,
                                )
                            ).first()
                            
                            schema_dict = {}
                            if contract:
                                schema_dict = {
                                    "allowed_metrics": contract.allowed_metrics,
                                    "allowed_dimensions": contract.allowed_dimensions,
                                    "target_column": getattr(contract, 'target_column', None)
                                }
                            
                            recent_messages = chat_service.get_recent_context(
                                session=session,
                                session_id=session_id,
                                max_messages=5,
                            )
                            from app.services.llm.suggestion_generator import generate_contextual_suggestions
                            suggestions = await generate_contextual_suggestions(
                                schema=schema_dict,
                                conversation_history=recent_messages,
                                latest_result=output_data,
                            )
                            if not isinstance(output_data, dict):
                                output_data = {}
                            output_data["followup_suggestions"] = suggestions
                        except Exception as sug_err:
                            logger.error(f"Failed to generate contextual suggestions in stream: {sug_err}")

                    # 3. Add assistant message
                    assistant_msg = chat_service.add_assistant_message(
                        session=session,
                        session_id=session_id,
                        content=assistant_content,
                        output_data=output_data,
                        intent_type=intent_type,
                    )

                    complete_payload = {
                        "user_message": MessageResponse.model_validate(user_msg).model_dump(mode="json"),
                        "assistant_message": MessageResponse.model_validate(assistant_msg).model_dump(mode="json"),
                    }
                    await queue.put(("complete", complete_payload))
                except Exception as task_err:
                    logger.error(f"Error in stream task execution: {task_err}", exc_info=True)
                    await queue.put(("error", str(task_err)))

            task = asyncio.create_task(run_pipeline())

            while True:
                event_type, payload = await queue.get()
                if event_type == "error":
                    yield f"event: error\ndata: {json.dumps({'detail': payload})}\n\n"
                    break
                elif event_type == "progress":
                    yield f"event: progress\ndata: {json.dumps(payload)}\n\n"
                elif event_type == "thought":
                    yield f"event: thought\ndata: {json.dumps(payload)}\n\n"
                elif event_type == "complete":
                    yield f"event: complete\ndata: {json.dumps(payload)}\n\n"
                    break
                queue.task_done()
        except asyncio.CancelledError:
            logger.info("Streaming connection cancelled by client")
            if task:
                task.cancel()
        except Exception as e:
            logger.error(f"Unexpected streaming route error: {e}")
            yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get(
    "/suggestions",
    summary="Get initial dataset-aware suggestions for a dataset version",
)
async def get_initial_suggestions_by_version(
    dataset_version_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
):
    """
    Get initial suggestions directly using the dataset version ID.
    """
    try:
        contract = session.exec(
            select(AnalysisContract).where(
                AnalysisContract.dataset_version_id == dataset_version_id,
                AnalysisContract.is_active == True,
            )
        ).first()
        
        schema_dict = {}
        if contract:
            schema_dict = {
                "allowed_metrics": contract.allowed_metrics,
                "allowed_dimensions": contract.allowed_dimensions,
                "target_column": getattr(contract, 'target_column', None)
            }
        
        from app.services.llm.suggestion_generator import generate_contextual_suggestions
        suggestions = await generate_contextual_suggestions(
            schema=schema_dict,
            conversation_history=[],
            latest_result=None,
        )
        return {"suggestions": suggestions}
    except Exception as e:
        import logging
        logging.getLogger("uvicorn").error(f"Failed to generate initial suggestions by version: {e}")
        return {"suggestions": ["What is total revenue?", "Compare metrics by category"]}


@router.get(
    "/sessions/{session_id}/suggestions",
    summary="Get initial dataset-aware suggestions for a session",
)
async def get_initial_suggestions(
    session_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
):
    """
    lightweight initial suggestions generator
    """
    try:
        chat_session = chat_service.get_chat_session(
            session=session,
            session_id=session_id,
            user_id=UUID(current_user.user_id),
        )
        
        has_dataset_attached = bool(chat_session.dataset_version_id)
        if not has_dataset_attached:
            return {"suggestions": ["What is total revenue?", "Compare metrics by category"]}
            
        contract = session.exec(
            select(AnalysisContract).where(
                AnalysisContract.dataset_version_id == chat_session.dataset_version_id,
                AnalysisContract.is_active == True,
            )
        ).first()
        
        schema_dict = {}
        if contract:
            schema_dict = {
                "allowed_metrics": contract.allowed_metrics,
                "allowed_dimensions": contract.allowed_dimensions,
                "target_column": getattr(contract, 'target_column', None)
            }
        
        from app.services.llm.suggestion_generator import generate_contextual_suggestions
        suggestions = await generate_contextual_suggestions(
            schema=schema_dict,
            conversation_history=[],
            latest_result=None,
        )
        return {"suggestions": suggestions}
    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)
    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)


# =============================================================================
# NL-First Interaction Endpoints (Phase 3.3)
# =============================================================================

class NLQueryRequest(BaseModel):
    """Request for natural language query (primary UI interaction)."""
    query: str = Field(..., min_length=1, max_length=1000)
    dataset_id: Optional[UUID] = None
    context: Optional[Dict[str, Any]] = None


class NLQueryResponse(BaseModel):
    """Response for natural language query."""
    answer: str
    sql: Optional[str] = None
    chart: Optional[Dict[str, Any]] = None
    kpis: Optional[List[Dict[str, Any]]] = None
    suggested_followups: List[str] = []
    confidence: str = "high"


@router.post(
    "/nl/query",
    response_model=NLQueryResponse,
    summary="Natural language query (primary UI interaction)",
)
async def nl_query(
    request: NLQueryRequest,
    session: DBSession,
    current_user: RateLimitedUser,
) -> NLQueryResponse:
    """
    Primary UI interaction endpoint for natural language queries.
    
    Accepts a natural language question and returns:
    - A human-readable answer
    - Optional SQL for transparency
    - Optional chart data for visualization
    - Suggested follow-up questions
    """
    from app.services.llm.sql_generator import SQLGenerator
    from app.services.analytics.csv_loader import safe_read_csv
    from app.services.dataset_version_service import get_latest_version
    
    if not request.dataset_id:
        # General knowledge query without dataset
        return NLQueryResponse(
            answer="Please attach a dataset to ask questions about your data.",
            suggested_followups=["Upload a dataset", "View existing datasets"],
            confidence="high"
        )
    
    # Verify ownership
    from app.api.deps import verify_dataset_owner
    await verify_dataset_owner(
        dataset_id=request.dataset_id,
        session=session,
        current_user=current_user
    )
    
    # Load dataset
    latest_version = get_latest_version(session=session, dataset_id=request.dataset_id)
    if not latest_version:
        raise HTTPException(status_code=404, detail="Dataset version not found")
    
    file_path = (
        latest_version.cleaned_reference
        if latest_version.cleaned_reference
        else latest_version.source_reference
    )
    df = safe_read_csv(file_path)
    
    # Generate SQL from natural language
    try:
        sql_result = SQLGenerator.generate_from_nl(
            query=request.query,
            schema=df.columns.tolist(),
            sample_data=df.head(3).to_dict('records')
        )
        
        # Execute the SQL
        if sql_result and sql_result.get("sql"):
            result_df = df.query(sql_result["sql"]) if "sql" in sql_result else df
            
            # Format the answer
            answer = sql_result.get("explanation", f"Found {len(result_df)} results")
            
            # Generate chart if applicable
            chart = None
            if len(result_df) > 0 and len(result_df.columns) >= 2:
                chart = {
                    "type": "bar",
                    "data": result_df.head(20).to_dict('records')
                }
            
            # Generate suggested follow-ups
            suggested_followups = [
                f"Show me more details about {request.query}",
                "Compare by different dimension",
                "What are the trends over time?"
            ]
            
            return NLQueryResponse(
                answer=answer,
                sql=sql_result.get("sql"),
                chart=chart,
                suggested_followups=suggested_followups,
                confidence="high"
            )
    except Exception as e:
        logger.warning(f"NL query processing failed: {e}")
    
    # Fallback: return a helpful message
    return NLQueryResponse(
        answer="I couldn't process that query. Try asking about specific metrics, trends, or comparisons.",
        suggested_followups=[
            "What are the top metrics?",
            "Show trends over time",
            "Compare categories"
        ],
        confidence="low"
    )


