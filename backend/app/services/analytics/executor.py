import json
import time
import logging
import re
from typing import Optional, Tuple
from .db_engine import DBEngine
from ..llm.sql_validator import SQLValidator
from ..llm.sql_generator import SQLGenerator
from ..llm.llm_router import LLMRouter

logger = logging.getLogger(__name__)


def _extract_current_question(user_query: str) -> str:
    """Extract the latest user question when context is prepended."""
    marker = "[Current Question]:"
    if marker in user_query:
        return user_query.rsplit(marker, 1)[1].strip()
    return user_query


_CLARIFICATION_MARKER_RE = re.compile(
    r'\[Column Clarification:\s*term="(?P<term>[^"]+)",\s*chosen="(?P<chosen>[^"]+)"\]'
)


def _extract_clarification_marker(user_query: str) -> Optional[Tuple[str, str]]:
    """Read the structured [Column Clarification] marker emitted by the
    chat-routes clarification rewrite.

    Returns ``(term, chosen_column)`` if the marker is present, else ``None``.
    The marker is consumed (stripped from the user-facing text) by the
    caller after extraction.
    """
    if not user_query:
        return None
    m = _CLARIFICATION_MARKER_RE.search(user_query)
    if not m:
        return None
    return m.group("term"), m.group("chosen")


_RESOLUTION_STOPWORDS = {
    "what", "which", "show", "list", "give", "with", "from", "that", "this", "have", "has",
    "where", "when", "then", "than", "into", "onto", "about", "like", "these", "those", "there",
    "across", "over", "under", "between", "performs", "perform", "well", "high", "higher", "highest",
    "rate", "query", "data", "dataset", "table", "month", "months", "for", "by", "of", "and", "or",
    "in", "on", "at", "to", "a", "an", "the", "count", "total", "sum", "avg", "average", "min", "max",
    "chart", "plot", "bar", "line", "pie", "scatter", "details", "metric", "metrics", "column", "columns",
    "value", "values",
}


def _extract_resolution_keywords(query: str) -> list[str]:
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9_\-]*", (query or "").lower())
    keywords = []
    seen = set()

    for word in words:
        if len(word) <= 2 or word in _RESOLUTION_STOPWORDS:
            continue
        if word not in seen:
            seen.add(word)
            keywords.append(word)

    return keywords


def _build_business_semantic_hints(query: str, available_cols: list[str], column_metadata: dict) -> list[dict]:
    """Add high-value business hints for common analytical phrasing across domains."""
    from .semantic_resolver import find_column

    q = (query or "").lower()
    hints: list[dict] = []

    def add_hint(keyword: str, column: str, hint_type: str = "TEXT", was_coerced: bool = False):
        if not column:
            return
        if any(h["column"] == column and h["keyword"] == keyword for h in hints):
            return
        hints.append({
            "keyword": keyword,
            "column": column,
            "type": hint_type,
            "was_coerced": was_coerced,
        })

    def resolve_metric(metric_keywords: list[str]) -> str | None:
        return find_column(metric_keywords, available_cols, threshold=0.5)

    asks_subcategory = any(k in q for k in ["sub category", "subcategory", "sub-category", "sub_category"])
    asks_performance = any(k in q for k in ["performs well", "best", "top", "highest", "high", "good performance"])
    asks_profit = "profit" in q
    asks_retention = "retention" in q
    asks_month_to_month = any(k in q for k in ["month-to-month", "month to month", "monthtomonth", "m2m"])
    asks_churn = any(k in q for k in ["churn", "churned", "churn rate", "churn percentage"])
    asks_at_risk = any(k in q for k in ["at risk", "at-risk", "charges at risk", "revenue at risk", "value at risk", "customers at risk"])

    # Detect exclusion phrasing, e.g. "excluding furniture category", "without furniture".
    exclusion_match = re.search(
        r"\b(?:exclude|excluding|without|not including)\s+([a-zA-Z0-9_\-\s]+?)(?:\s+from\b|\s+in\b|\s+category\b|\s+categories\b|$)",
        q,
    )
    excluded_value = None
    if exclusion_match:
        excluded_value = exclusion_match.group(1).strip()
        if excluded_value.startswith("the "):
            excluded_value = excluded_value[4:].strip()
        excluded_value = re.sub(r"\s+", " ", excluded_value)
        if excluded_value and excluded_value not in {"category", "categories"}:
            category_col = find_column(["category", "sub category", "subcategory", "segment", "type"], available_cols, threshold=0.5)
            if category_col:
                add_hint("exclude_value_filter", category_col, "FILTER", bool(column_metadata.get(category_col, {}).get("coerced")))
                hints[-1]["value"] = excluded_value

    if asks_subcategory:
        subcat_col = find_column(["sub category", "subcategory", "sub_category", "sub-category"], available_cols, threshold=0.5)
        if subcat_col:
            add_hint("subcategory_dimension", subcat_col, "DIMENSION", bool(column_metadata.get(subcat_col, {}).get("coerced")))

    if asks_subcategory and (asks_performance or asks_profit):
        preferred_metric = None
        if asks_profit:
            preferred_metric = resolve_metric(["profit", "net profit", "margin"])
        if not preferred_metric:
            preferred_metric = resolve_metric(["sales", "revenue", "amount", "income"])
        if preferred_metric:
            add_hint("ranking_metric", preferred_metric, "METRIC", bool(column_metadata.get(preferred_metric, {}).get("coerced")))

    churn_col = resolve_metric(["churn", "churned", "attrition", "cancelled", "is churned"])
    if churn_col:
        if asks_churn:
            add_hint("churn_rate_calculation", churn_col, "METRIC", bool(column_metadata.get(churn_col, {}).get("coerced")))
        if asks_at_risk:
            add_hint("at_risk_calculation", churn_col, "METRIC", bool(column_metadata.get(churn_col, {}).get("coerced")))

    if asks_retention:
        retention_col = resolve_metric(["retention", "retained", "stay", "active rate"])
        contract_col = find_column(["contract", "contract type", "plan", "subscription"], available_cols, threshold=0.5)

        if contract_col:
            add_hint("contract_filter", contract_col, "DIMENSION", bool(column_metadata.get(contract_col, {}).get("coerced")))
        if churn_col:
            add_hint("retention_from_churn", churn_col, "METRIC", bool(column_metadata.get(churn_col, {}).get("coerced")))
        elif retention_col:
            add_hint("retention_metric", retention_col, "METRIC", bool(column_metadata.get(retention_col, {}).get("coerced")))

        if asks_month_to_month and contract_col:
            add_hint("month_to_month_scope", contract_col, "FILTER", bool(column_metadata.get(contract_col, {}).get("coerced")))

    # Parenthetical dimensional scoping: Category(Furniture), Region(East), etc.
    parenthetical_pairs = re.findall(r"\b([a-zA-Z][a-zA-Z0-9_\-\s]{1,40})\s*\(\s*([^)]+?)\s*\)", q)
    for raw_key, raw_value in parenthetical_pairs:
        key = re.sub(r"\s+", " ", raw_key.strip())
        value = re.sub(r"\s+", " ", raw_value.strip())
        if not key or not value:
            continue
        mapped_col = find_column([key], available_cols, threshold=0.5)
        if mapped_col:
            add_hint("dimension_value_filter", mapped_col, "FILTER", bool(column_metadata.get(mapped_col, {}).get("coerced")))
            hints[-1]["value"] = value

    # Comparison filters: "sales less than 1000 and orders less than 3"
    comparison_patterns = [
        r"\b([a-zA-Z][a-zA-Z0-9_\-\s]{1,40})\s*(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)",
        r"\b([a-zA-Z][a-zA-Z0-9_\-\s]{1,40})\s+(less than or equal to|greater than or equal to|less than|greater than|under|below|over|above|at least|at most)\s+(-?\d+(?:\.\d+)?)",
    ]
    for pattern in comparison_patterns:
        for raw_key, raw_op, raw_val in re.findall(pattern, q):
            key = re.sub(r"\s+", " ", raw_key.strip())
            mapped_col = find_column([key], available_cols, threshold=0.55)
            if not mapped_col:
                continue
            add_hint("comparison_filter", mapped_col, "FILTER", bool(column_metadata.get(mapped_col, {}).get("coerced")))
            hints[-1]["operator"] = raw_op.strip().lower()
            hints[-1]["value"] = raw_val

    return hints


def _render_hint_lines(hints: list[dict]) -> list[str]:
    lines = []
    for h in hints:
        kw = h.get("keyword", "keyword")
        col = h.get("column", "")
        h_type = h.get("type", "TEXT")
        was_coerced = bool(h.get("was_coerced", False))
        msg = f"- [{h_type}] '{kw}' maps to column '{col}'"
        if was_coerced:
            msg += " (NOTE: column was auto-cleaned/cast for numeric analysis)"
        lines.append(msg)

    mapped_cols = {h.get("column") for h in hints if h.get("column")}
    mapped_keys = {h.get("keyword") for h in hints}

    if "ranking_metric" in mapped_keys:
        lines.append("- [BUSINESS_RULE] For performance questions, rank by aggregated metric (SUM) descending and return top categories unless user asks otherwise.")

    if "retention_from_churn" in mapped_keys:
        lines.append("- [BUSINESS_RULE] Retention rate should be computed as (1 - AVG(CASE WHEN LOWER(CAST(\"" + next((h.get("column") for h in hints if h.get("keyword") == "retention_from_churn"), "Churn") + "\" AS VARCHAR)) IN ('yes', 'true', '1') THEN 1.0 ELSE 0.0 END)) * 100.0.")
    elif "retention_metric" in mapped_keys:
        lines.append("- [BUSINESS_RULE] Use the retention metric directly; if values are 0-1 ratios, multiply by 100 for percentage output.")

    if "churn_rate_calculation" in mapped_keys:
        churn_col = next((h.get("column") for h in hints if h.get("keyword") == "churn_rate_calculation"), None)
        if churn_col:
            lines.append(f"- [BUSINESS_RULE] Churn rate should be computed as AVG(CASE WHEN LOWER(CAST(\"{churn_col}\" AS VARCHAR)) IN ('yes', 'true', '1') THEN 1.0 ELSE 0.0 END) * 100.0. Make sure to multiply by 100.0 to represent it as a percentage from 0 to 100.")

    if "at_risk_calculation" in mapped_keys:
        churn_col = next((h.get("column") for h in hints if h.get("keyword") == "at_risk_calculation"), None)
        if churn_col:
            lines.append(f"- [BUSINESS_RULE] \"at risk\" metrics (e.g. \"charges at risk\", \"revenue at risk\", \"customers at risk\") refer to customers who have churned. You must filter the data where the churn indicator is positive: LOWER(CAST(\"{churn_col}\" AS VARCHAR)) IN ('yes', 'true', '1'). For example, \"total charges at risk\" should be calculated as SUM(\"TotalCharges\") FILTER (WHERE LOWER(CAST(\"{churn_col}\" AS VARCHAR)) IN ('yes', 'true', '1')) or by applying a WHERE clause.")

    if "month_to_month_scope" in mapped_keys:
        contract_col = next((h.get("column") for h in hints if h.get("keyword") == "month_to_month_scope"), None)
        if contract_col:
            lines.append(f"- [BUSINESS_RULE] Apply filter LOWER(CAST(\"{contract_col}\" AS VARCHAR)) LIKE '%month%to%month%' for month-to-month contract scope.")

    exclusion_hint = next((h for h in hints if h.get("keyword") == "exclude_value_filter"), None)
    if exclusion_hint and exclusion_hint.get("column") and exclusion_hint.get("value"):
        col = exclusion_hint.get("column")
        val = str(exclusion_hint.get("value")).replace("'", "''").lower()
        lines.append(
            f"- [BUSINESS_RULE] Exclude rows where LOWER(CAST(\"{col}\" AS VARCHAR)) LIKE '%{val}%'. Apply this exclusion before aggregation and charting."
        )

    # Parenthetical filter hints: treat value as a scoped category/dimension filter.
    for h in [x for x in hints if x.get("keyword") == "dimension_value_filter"]:
        col = h.get("column")
        val = str(h.get("value", "")).replace("'", "''").strip().lower()
        if col and val:
            lines.append(
                f"- [BUSINESS_RULE] Apply scoped filter LOWER(CAST(\"{col}\" AS VARCHAR)) LIKE '%{val}%'. This filter is mandatory for the requested slice."
            )

    # Numeric comparison filter hints.
    op_map = {
        "less than": "<",
        "under": "<",
        "below": "<",
        "greater than": ">",
        "over": ">",
        "above": ">",
        "less than or equal to": "<=",
        "greater than or equal to": ">=",
        "at least": ">=",
        "at most": "<=",
        "<": "<",
        ">": ">",
        "<=": "<=",
        ">=": ">=",
    }
    comparison_hints = [x for x in hints if x.get("keyword") == "comparison_filter"]
    for h in comparison_hints:
        col = h.get("column")
        op = op_map.get(str(h.get("operator", "")).strip().lower())
        val = str(h.get("value", "")).strip()
        if col and op and val:
            lines.append(
                f"- [BUSINESS_RULE] Apply numeric filter TRY_CAST(\"{col}\" AS DOUBLE) {op} {val} before aggregation."
            )

    if len(comparison_hints) >= 2:
        lines.append("- [BUSINESS_RULE] Combine multiple filter conditions with AND unless user explicitly requests OR.")

    if mapped_cols:
        col_list = ", ".join(sorted(mapped_cols))
        lines.append(f"- [STRICT_SCHEMA] Prefer these mapped columns first: {col_list}")

    return lines


class Executor:
    """NL2SQL self-healing execution engine with timing instrumentation and multi-agent loop."""

    MAX_RETRIES = 3

    def __init__(self):
        self.router = LLMRouter()

    async def _run_strategist(self, user_query: str, schema: dict, hints: list[dict]) -> dict:
        """Strategist Phase: Analyze query and schema to output a logical analytical plan in JSON."""
        system_prompt = (
            "You are an expert data strategist (Strategist agent).\n"
            "Your job is to analyze the user query and database schema, then design a step-by-step logical plan "
            "to answer the question. You DO NOT write SQL. You output a structured JSON plan.\n\n"
            "DIAGNOSTIC RULE: For open-ended diagnostic queries (e.g. 'why is churn high', 'what drives support tickets'), "
            "the plan MUST be multi-dimensional. Do not check just a single driver column (e.g. Contract). Instead, plan steps "
            "to query multiple independent dimensions (e.g. Contract type, Payment method, Monthly Charges, and Ticket counts) "
            "correlated with the outcome to provide a comprehensive explanation.\n\n"
            "The JSON must have the following format:\n"
            "{\n"
            "  \"analysis_intent\": \"<brief description of intent, e.g. trend/aggregation/kpi/comparison>\",\n"
            "  \"steps\": [\n"
            "    {\n"
            "      \"step_number\": 1,\n"
            "      \"description\": \"<what this step does, e.g. filter category to Furniture, calculate total revenue per month>\",\n"
            "      \"columns_involved\": [\"<column1>\", \"<column2>\"]\n"
            "    }\n"
            "  ]\n"
            "}"
        )
        user_prompt = (
            f"Database Schema:\n{json.dumps(schema)}\n\n"
            f"Column Mapping Hints:\n{json.dumps(hints)}\n\n"
            f"User Query:\n{user_query}\n\n"
            "Return ONLY the strict JSON object matching the format above."
        )
        response = await self.router.client.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            purpose="sql"
        )
        return self.router._parse_json(response.content)

    async def _run_coder(
        self,
        user_query: str,
        schema: dict,
        plan: dict,
        hints: list[dict],
        correction_hint: Optional[str] = None
    ) -> dict:
        """Coder Phase: Translate strategist logical plan into DuckDB SQL and UI metadata."""
        system_prompt = (
            "You are an expert DuckDB SQL developer and chart designer (Coder agent).\n"
            "Your job is to translate a logical data strategy plan into valid DuckDB SQL and UI chart metadata.\n"
            "RULES:\n"
            "1. Generate valid DuckDB SQL syntax. Refer to sample data and data types in the schema.\n"
            "2. If a column is VARCHAR/STRING but contains numeric data, use `TRY_CAST(column AS DOUBLE)` for aggregates.\n"
            "3. If a column is a date represented as string, parse it using `TRY_CAST(column AS DATE)` or strptime chronologically.\n"
            "4. Match the user's intent to one of these chart types: bar, stacked_bar, line, pie, kpi, table.\n"
            "5. LTV (Lifetime Value) CALCULATIONS: For subscription/churn-related datasets, LTV MUST be calculated using the standard actuarial formula: LTV = ARPU / Monthly Churn Rate.\n"
            "   - ARPU = Average Monthly Charges: `AVG(\"MonthlyCharges\")` (or similar column).\n"
            "   - Monthly Churn Rate = Churned Customers divided by Total Tenure: `SUM(CASE WHEN LOWER(CAST(\"Churn\" AS VARCHAR)) = 'yes' THEN 1.0 ELSE 0.0 END) / NULLIF(SUM(TRY_CAST(\"tenure\" AS DOUBLE)), 0.0)`.\n"
            "   - Combined LTV SQL: `SELECT AVG(TRY_CAST(\"MonthlyCharges\" AS DOUBLE)) / (SUM(CASE WHEN LOWER(CAST(\"Churn\" AS VARCHAR)) = 'yes' THEN 1.0 ELSE 0.0 END) / NULLIF(SUM(TRY_CAST(\"tenure\" AS DOUBLE)), 0.0)) AS \"ltv\" FROM data`.\n"
            "   - Never calculate LTV as a simple average of charges multiplied by tenure, nor as total charges divided by churn. Standardize on the actuarial formula above.\n"
            "6. If a critic provided a correction hint, you MUST adapt and fix the query accordingly.\n"
            "7. Output a strict JSON object with NO OTHER TEXT. No markdown codeblocks.\n\n"
            "The JSON must have the following format:\n"
            "{\n"
            "  \"sql\": \"<valid DuckDB SQL query>\",\n"
            "  \"chart_type\": \"bar|stacked_bar|line|pie|kpi|table\",\n"
            "  \"title\": \"<short descriptive chart title>\",\n"
            "  \"x_axis\": \"<label for X axis, or null for kpi>\",\n"
            "  \"y_axis\": \"<label for Y axis, or null for kpi>\"\n"
            "}"
        )
        user_prompt = (
            f"Database Schema:\n{json.dumps(schema)}\n\n"
            f"Column Mapping Hints:\n{json.dumps(hints)}\n\n"
            f"Strategist Plan:\n{json.dumps(plan)}\n\n"
            f"User Query:\n{user_query}\n\n"
        )
        if correction_hint:
            user_prompt += f"CRITIC FEEDBACK / CORRECTION HINT:\n{correction_hint}\n\nPlease revise the SQL query based on this feedback.\n\n"
            
        user_prompt += "Return ONLY the strict JSON object matching the format above."
        response = await self.router.client.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            purpose="sql"
        )
        return self.router._parse_json(response.content)

    async def _run_critic(self, sql: str, result_data: list, columns: list, schema: dict) -> dict:
        """Critic Phase: Verify if the query and its output are syntactically and logically correct."""
        system_prompt = (
            "You are an adversarial database critic (Critic agent).\n"
            "Your job is to review the SQL query and its execution results to identify any logical, syntax, "
            "or data errors before showing them to the user.\n\n"
            "CHECK FOR:\n"
            "1. SQL Syntax & Executability: The SQL must start with 'SELECT' and be valid DuckDB SQL. "
            "   Formulas like 'LTV = Avg * Tenure' are NOT valid SQL and must be REJECTED.\n"
            "2. LTV Formula Verification: Reject any attempt to compute LTV as simple tenure multiplication or `TotalCharges / ChurnRate`. "
            "   Insist on the actuarial formula: ARPU divided by Monthly Churn Rate (total churned / total tenure).\n"
            "3. Diagnostic Multi-Dimensionality: For open-ended 'why' or driver queries, ensure the SQL queries multiple relevant drivers "
            "   (e.g., Contract, Churn, Tickets, Charges, and PaymentMethod). If the Coder only queried a single column, REJECT with a hint "
            "   instructing the Coder to query a combination of drivers.\n"
            "4. Data Type Compatibility: Aggregate functions (SUM, AVG, MIN, MAX) must not run on raw VARCHAR/STRING columns. "
            "   They must be cast using `TRY_CAST(col AS DOUBLE)` or similar if the column is a string.\n"
            "5. Anti-Tautology check: Reject filters that are always true (e.g., '1=1') or aggregate filters that render the aggregation meaningless.\n"
            "6. Named Driver & Domain Presence: Verify that the result columns map to the user's intent. "
            "   If the query yielded no rows or only NULLs, check if there is an error in filter values (e.g., case mismatch, trailing spaces).\n"
            "7. Proper sorting and chronological sorting for trends.\n\n"
            "The JSON must have the following format:\n"
            "{\n"
            "  \"approved\": true|false,\n"
            "  \"correction_hint\": \"<if approved is false, provide a clear instruction for the coder to fix the query, otherwise null>\"\n"
            "}"
        )
        user_prompt = (
            f"Generated SQL:\n{sql}\n\n"
            f"Result Column Names: {columns}\n\n"
            f"Result Sample Data (up to 5 rows):\n{json.dumps(result_data[:5])}\n\n"
            f"Database Schema:\n{json.dumps(schema)}\n\n"
            "Return ONLY the strict JSON object matching the format above."
        )
        response = await self.router.client.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            purpose="sql"
        )
        return self.router._parse_json(response.content)

    async def _run_synthesis(
        self,
        user_query: str,
        sql: str,
        data: list,
        columns: list,
        schema: dict,
        coder_metadata: dict
    ) -> str:
        """Synthesizer Phase: Produce explanations and key insights from the execution results using secondary narrative model."""
        system_prompt = (
            "You are an expert data synthesizer (Synthesizer agent).\n"
            "Your job is to explain the SQL query results to the user in a clear, narrative analyst style.\n\n"
            "RULES:\n"
            "1. Output must be formatted as 2-4 markdown bullet points (using '- ').\n"
            "2. Lead with the most important finding/trend first.\n"
            "3. Sound natural, direct, and specific (like a real analyst talking to a colleague).\n"
            "4. Cite key numbers from the results, including currency symbols for money, and percentages where appropriate.\n"
            "5. Multi-Driver Synthesis: For driver/churn analytics, ensure the narrative describes how the different drivers "
            "   (e.g., Contract types, support ticket volume, payment types) correlate together to cause the outcome.\n"
            "6. Cite or mention the SQL structure or key columns used (e.g., 'grouped by category' or 'filtering for East region').\n"
            "7. Keep the analysis grounded ONLY in the returned data. Do not hallucinate values."
        )
        user_prompt = (
            f"User Question: {user_query}\n\n"
            f"Executed SQL Query: {sql}\n\n"
            f"Result Column Names: {columns}\n\n"
            f"Result Data:\n{json.dumps(data[:15])}\n\n"
            f"Metadata: {json.dumps(coder_metadata)}\n\n"
            "Write the explanation following the rules above."
        )
        response = await self.router.client.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            purpose="chat_insight"
        )
        return response.content

    async def run_query(
        self,
        user_query: str,
        db: DBEngine,
        table_name: str = "data",
        progress_callback: Optional[Callable[[dict], Awaitable[None]]] = None
    ) -> dict:
        """
        Main self-healing loop for DuckDB Execution using the multi-agent flow.
        """
        t_total_start = time.perf_counter()

        schema = db.extract_schema(table_name)
        if "error" in schema:
            return {"success": False, "error": f"Schema extraction failed: {schema['error']}"}

        column_metadata = schema.get('column_metadata', {})
        available_cols = list(schema.get('columns', {}).keys())

        # Pre-resolve semantic hints once
        from .semantic_resolver import find_column, find_ambiguous_columns
        query_for_resolution = _extract_current_question(user_query)

        # Apply column-clarification marker (set by chat_routes when the user
        # resolves a column-ambiguity prompt). The marker (a) seeds a forced
        # column hint and (b) suppresses the ambiguity re-check for the
        # resolved term. Without this, the legacy text-rewrite would have
        # already produced "Name Name Name Name" before reaching the executor.
        clarification = _extract_clarification_marker(query_for_resolution)
        resolved_terms: set[str] = set()
        if clarification:
            resolved_term, resolved_column = clarification
            resolved_terms.add(resolved_term.lower())
            # Strip the marker from the resolution text used for keyword
            # extraction. Also strip it from the raw user_query so the LLM
            # prompts (strategist / coder / validator / critic) never see the
            # marker line.
            cleaned_resolution = _CLARIFICATION_MARKER_RE.sub(
                "", query_for_resolution
            ).strip()
            user_query = _CLARIFICATION_MARKER_RE.sub("", user_query).strip()
            query_for_resolution = cleaned_resolution

        hints = []
        keywords = _extract_resolution_keywords(query_for_resolution)
        for kw in keywords:
            match = find_column([kw], available_cols, threshold=0.7)
            if match and match not in [h['column'] for h in hints]:
                col_meta = column_metadata.get(match, {})
                hints.append({
                    "keyword": kw,
                    "column": match,
                    "type": col_meta.get("type", "").upper(),
                    "was_coerced": col_meta.get("coerced", False)
                })

        business_hints = _build_business_semantic_hints(query_for_resolution, available_cols, column_metadata)
        for hint in business_hints:
            if hint.get("column") not in [h.get("column") for h in hints]:
                hints.append(hint)

        # Force-seed the resolved column as a hint (highest priority — the
        # user has explicitly picked it). The hint overrides any weaker
        # auto-resolution for the same column.
        if clarification:
            forced_column = clarification[1]
            forced_col_meta = column_metadata.get(forced_column, {})
            hints.insert(
                0,
                {
                    "keyword": clarification[0],
                    "column": forced_column,
                    "type": forced_col_meta.get("type", "").upper(),
                    "was_coerced": forced_col_meta.get("coerced", False),
                    "forced_by_user": True,
                },
            )

        # Ambiguity Detection
        for kw in keywords:
            # Skip terms the user has already disambiguated via the
            # [Column Clarification] marker — re-asking them would loop.
            if kw.lower() in resolved_terms:
                continue
            candidates = find_ambiguous_columns(kw, available_cols, threshold=0.6)
            if len(candidates) >= 2 and candidates[0][1] < 0.95:
                if (candidates[0][1] - candidates[1][1]) < 0.2:
                    total_time_ms = round((time.perf_counter() - t_total_start) * 1000)
                    logger.info(f"Ambiguity detected for '{kw}': {candidates}")
                    return {
                        "success": False,
                        "ambiguity": {
                            "term": kw,
                            "candidates": [
                                {"column": col, "score": score}
                                for col, score in candidates[:5]
                            ],
                            "question": f"Which '{kw}' column did you mean?",
                        },
                        "timing": {
                            "llm_ms": 0,
                            "validation_ms": 0,
                            "execution_ms": 0,
                            "total_ms": total_time_ms,
                            "retries": 0,
                        },
                    }

        # Strategist Phase
        t_llm_start = time.perf_counter()
        if progress_callback:
            await progress_callback({"step": 1, "total": 4, "phase": "planning", "detail": "Strategist: Deconstructing query and planning layout..."})
        
        try:
            plan = await self._run_strategist(user_query, schema, hints)
        except Exception as e:
            logger.error(f"Strategist failed: {e}")
            plan = {"analysis_intent": "general", "steps": []}

        llm_time_ms = 0
        validation_time_ms = 0
        execution_time_ms = 0
        current_error = None
        last_sql = None
        final_coder_meta = {}
        result_data = []
        result_columns = []

        # Self-healing loop with Coder and Critic
        for attempt in range(self.MAX_RETRIES):
            if progress_callback:
                await progress_callback({"step": 2, "total": 4, "phase": "coding", "detail": f"Coder: Generating DuckDB query (attempt {attempt + 1})..."})

            # LLM Coder generation
            t_coder_start = time.perf_counter()
            try:
                coder_result = await self._run_coder(user_query, schema, plan, hints, current_error)
            except Exception as e:
                current_error = f"Coder generation failed: {str(e)}"
                llm_time_ms += round((time.perf_counter() - t_coder_start) * 1000)
                continue
            
            llm_time_ms += round((time.perf_counter() - t_coder_start) * 1000)
            raw_sql = coder_result.get("sql", "").strip()
            last_sql = raw_sql
            final_coder_meta = coder_result

            # Validate + Execute
            t_val_start = time.perf_counter()
            try:
                # Early syntactical validate
                from ..llm.sql_validator import SQLValidator
                SQLValidator.validate(raw_sql)
                validation_time_ms += round((time.perf_counter() - t_val_start) * 1000)

                # Execute
                t_exec_start = time.perf_counter()
                raw_sql_upper = raw_sql.upper()
                is_aggregative = any(kw in raw_sql_upper for kw in ["GROUP BY", "SUM(", "AVG(", "COUNT(", "MIN(", "MAX(", "WINDOW"])
                timeout_sec = 20 if is_aggregative else 10

                result_df = await db.execute_query(raw_sql, table_name=table_name, timeout_seconds=timeout_sec)
                execution_time_ms += round((time.perf_counter() - t_exec_start) * 1000)

                result_json = result_df.to_json(orient="records", date_format="iso")
                result_data = json.loads(result_json)
                result_columns = list(result_df.columns)

                # Critic Phase
                if progress_callback:
                    await progress_callback({"step": 3, "total": 4, "phase": "critiquing", "detail": f"Critic: Reviewing query validity & results (attempt {attempt + 1})..."})

                t_critic_start = time.perf_counter()
                critic_result = await self._run_critic(raw_sql, result_data, result_columns, schema)
                llm_time_ms += round((time.perf_counter() - t_critic_start) * 1000)

                if critic_result.get("approved"):
                    # Critic approved! Exit loop.
                    current_error = None
                    break
                else:
                    current_error = critic_result.get("correction_hint") or "Critic rejected result."
                    logger.warning(f"Critic rejected attempt {attempt + 1}: {current_error}")
            except Exception as e:
                # Catch syntax error or database execution exception as failure feedback
                current_error = str(e)
                validation_time_ms += round((time.perf_counter() - t_val_start) * 1000)
                logger.warning(f"Execution failed on attempt {attempt + 1}: {current_error}")

        total_time_ms = round((time.perf_counter() - t_total_start) * 1000)

        if current_error:
            # Reached max retries without approval
            logger.error(f"NL2SQL Engine failed after {self.MAX_RETRIES} attempts.")
            error_type = "unknown"
            suggestion = None
            err_lower = current_error.lower()

            if "column" in err_lower and ("not found" in err_lower or "does not exist" in err_lower):
                error_type = "column_not_found"
                suggestion = f"Available columns: {', '.join(available_cols[:15])}"
            elif "syntax" in err_lower or "parser" in err_lower:
                error_type = "syntax_error"
                suggestion = "The generated SQL has a syntax issue. Try rephrasing your question."
            elif "timeout" in err_lower or "cancel" in err_lower:
                error_type = "timeout"
                suggestion = "The query took too long. Try asking for a smaller subset or a simpler aggregation."
            elif "empty" in err_lower or "no rows" in err_lower:
                error_type = "empty_result"
                suggestion = "No data matched your criteria. Try broadening your filters."

            return {
                "success": False,
                "error": f"Failed to resolve data query: {current_error}",
                "diagnostics": {
                    "error_type": error_type,
                    "attempted_sql": last_sql,
                    "suggestion": suggestion,
                    "available_columns": available_cols[:20],
                    "retry_count": self.MAX_RETRIES,
                },
                "timing": {
                    "llm_ms": llm_time_ms,
                    "validation_ms": validation_time_ms,
                    "execution_ms": execution_time_ms,
                    "total_ms": total_time_ms,
                    "retries": self.MAX_RETRIES,
                },
            }

        # Synthesizer Phase
        if progress_callback:
            await progress_callback({"step": 4, "total": 4, "phase": "complete", "detail": "Synthesizer: Compiling explanation and key takeaways..."})

        t_synthesis_start = time.perf_counter()
        try:
            explanation = await self._run_synthesis(
                user_query=user_query,
                sql=last_sql,
                data=result_data,
                columns=result_columns,
                schema=schema,
                coder_metadata=final_coder_meta
            )
        except Exception as e:
            logger.error(f"Synthesizer failed: {e}")
            explanation = "Here are the query results."

        # Increment llm time with synthesis time
        llm_time_ms += round((time.perf_counter() - t_synthesis_start) * 1000)
        total_time_ms = round((time.perf_counter() - t_total_start) * 1000)

        return {
            "success": True,
            "sql": last_sql,
            "data": result_data,
            "columns": result_columns,
            "column_metadata": column_metadata,
            "row_count": len(result_data),
            "chart_type": final_coder_meta.get("chart_type", "table"),
            "title": final_coder_meta.get("title", ""),
            "x_axis": final_coder_meta.get("x_axis", ""),
            "y_axis": final_coder_meta.get("y_axis", ""),
            "explanation": explanation,
            "timing": {
                "llm_ms": llm_time_ms,
                "validation_ms": validation_time_ms,
                "execution_ms": execution_time_ms,
                "total_ms": total_time_ms,
                "retries": attempt,
            },
        }
