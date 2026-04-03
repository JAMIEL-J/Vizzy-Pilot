import json
import time
import logging
import re
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


_RESOLUTION_STOPWORDS = {
    "what", "which", "show", "list", "give", "with", "from", "that", "this", "have", "has",
    "where", "when", "then", "than", "into", "onto", "about", "like", "these", "those", "there",
    "across", "over", "under", "between", "performs", "perform", "well", "high", "higher", "highest",
    "rate", "query", "data", "dataset", "table", "month", "months",
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
        if column in [h["column"] for h in hints]:
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

    if asks_retention:
        retention_col = resolve_metric(["retention", "retained", "stay", "active rate"])
        churn_col = resolve_metric(["churn", "churned", "attrition", "cancelled", "is churned"])
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
        lines.append("- [BUSINESS_RULE] Retention rate should be computed as (1 - AVG(churn_indicator)) * 100. If churn_indicator is already percentage, normalize first.")
    elif "retention_metric" in mapped_keys:
        lines.append("- [BUSINESS_RULE] Use the retention metric directly; if values are 0-1 ratios, multiply by 100 for percentage output.")

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
    """NL2SQL self-healing execution engine with timing instrumentation."""

    MAX_RETRIES = 3

    def __init__(self):
        self.router = LLMRouter()

    async def run_query(self, user_query: str, db: DBEngine, table_name: str = "data") -> dict:
        """
        Main self-healing loop for DuckDB Execution.

        1. Extract schema from DuckDB
        2. Build NL2SQL prompt via SQLGenerator
        3. Send to LLM Router (Groq → Gemini fallback)
        4. Validate + execute SQL
        5. On error, feed error back to LLM and retry (up to 3×)

        Returns timing breakdown in result['timing'].
        """
        t_total_start = time.perf_counter()

        schema = db.extract_schema(table_name)
        if "error" in schema:
            return {"success": False, "error": f"Schema extraction failed: {schema['error']}"}

        current_error = None
        last_sql = None
        column_metadata = schema.get('column_metadata', {})
        available_cols = list(schema.get('columns', {}).keys())

        # Pre-resolve semantic hints once (doesn't change across retries)
        from .semantic_resolver import find_column, find_ambiguous_columns
        query_for_resolution = _extract_current_question(user_query)
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

        # Add domain-aware business hints for robust NL coverage.
        business_hints = _build_business_semantic_hints(query_for_resolution, available_cols, column_metadata)
        for hint in business_hints:
            if hint.get("column") not in [h.get("column") for h in hints]:
                hints.append(hint)

        # ── Ambiguity Detection ──
        # If a keyword matches ≥2 columns strongly, ask user to clarify
        for kw in keywords:
            candidates = find_ambiguous_columns(kw, available_cols, threshold=0.6)
            # Only flag ambiguity if ≥2 matches and
            # the top score isn't overwhelmingly higher (< 0.95)
            if len(candidates) >= 2 and candidates[0][1] < 0.95:
                # Check gap between top 2 — if gap > 0.2, the winner is clear
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

        # Track cumulative timing across retries
        llm_time_ms = 0
        validation_time_ms = 0
        execution_time_ms = 0

        for attempt in range(self.MAX_RETRIES):
            # Build prompt
            prompt_query = user_query
            if hints:
                hint_lines = _render_hint_lines(hints)
                prompt_query = f"{prompt_query}\n\nColumn Mapping & Hinting:\n" + "\n".join(hint_lines)

            if current_error:
                prompt_query += (
                    f"\nWarning: The previous SQL failed with error: {current_error}. "
                    "Please fix the syntax or column names and try again."
                )
                logger.warning(f"NL2SQL retry {attempt}/{self.MAX_RETRIES}: {current_error}")

            full_prompt = SQLGenerator.format_prompt(prompt_query, schema)
            logger.info(
                "NL2SQL prompt metrics chars=%s columns=%s sample_rows=%s hints=%s attempt=%s",
                len(full_prompt),
                len(schema.get("columns", {}) or {}),
                len(schema.get("sample_data", []) or []),
                len(hints),
                attempt,
            )

            # ── LLM Generation (timed) ──
            t_llm = time.perf_counter()
            llm_result = await self.router.generate_sql(full_prompt, schema=json.dumps(schema))
            llm_time_ms = round((time.perf_counter() - t_llm) * 1000)

            raw_sql = llm_result.get("sql", "").strip()
            last_sql = raw_sql
            chart_type = llm_result.get("chart_type", "text")
            title = llm_result.get("title", "")

            try:
                # ── Validation (timed) ──
                t_val = time.perf_counter()
                SQLValidator.validate(raw_sql)
                validation_time_ms = round((time.perf_counter() - t_val) * 1000)

                # Determine timeout
                raw_sql_upper = raw_sql.upper()
                is_aggregative = any(kw in raw_sql_upper for kw in ["GROUP BY", "SUM(", "AVG(", "COUNT(", "MIN(", "MAX(", "WINDOW"])
                timeout_sec = 20 if is_aggregative else 10

                # ── DB Execution (timed) ──
                t_exec = time.perf_counter()
                result_df = await db.execute_query(raw_sql, timeout_seconds=timeout_sec)
                execution_time_ms = round((time.perf_counter() - t_exec) * 1000)

                result_json = result_df.to_json(orient="records", date_format="iso")
                result_data = json.loads(result_json)

                total_time_ms = round((time.perf_counter() - t_total_start) * 1000)

                return {
                    "success": True,
                    "sql": raw_sql,
                    "data": result_data,
                    "columns": list(result_df.columns),
                    "column_metadata": column_metadata,
                    "row_count": len(result_df),
                    "chart_type": chart_type,
                    "title": title,
                    "x_axis": llm_result.get("x_axis", ""),
                    "y_axis": llm_result.get("y_axis", ""),
                    "explanation": llm_result.get("explanation", ""),
                    "timing": {
                        "llm_ms": llm_time_ms,
                        "validation_ms": validation_time_ms,
                        "execution_ms": execution_time_ms,
                        "total_ms": total_time_ms,
                        "retries": attempt,
                    },
                }

            except Exception as e:
                current_error = str(e)
                continue

        total_time_ms = round((time.perf_counter() - t_total_start) * 1000)
        logger.error(f"NL2SQL Engine failed after {self.MAX_RETRIES} attempts.")

        # ── Structured diagnostics on failure ──
        error_type = "unknown"
        suggestion = None
        err_lower = (current_error or "").lower()

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
