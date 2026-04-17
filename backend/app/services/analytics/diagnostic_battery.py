"""
Interpretive Diagnostic Battery.

Belongs to: analytics services
Responsibility: Auto-generate and run multiple diagnostic queries for "why" questions.
When intent_type == INTERPRETIVE, this module produces multi-axis analysis.
"""

from typing import Any, Dict, List, Optional
import pandas as pd
import re

from app.core.logger import get_logger

logger = get_logger(__name__)


def _quote_identifier(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def _dimension_alias(group_cols: List[str]) -> str:
    if len(group_cols) == 1:
        return group_cols[0]
    return "__x__".join(group_cols)


def _is_binary_numeric(series: pd.Series) -> bool:
    """True when numeric series effectively behaves as binary target (0/1, true/false)."""
    if not pd.api.types.is_numeric_dtype(series):
        return False
    vals = [v for v in series.dropna().unique().tolist() if pd.notna(v)]
    normalized = set()

    for v in vals:
        if isinstance(v, bool):
            normalized.add(int(v))
            continue

        if isinstance(v, int):
            if v not in (0, 1):
                return False
            normalized.add(v)
            continue

        if isinstance(v, float):
            if not v.is_integer():
                return False
            iv = int(v)
            if iv not in (0, 1):
                return False
            normalized.add(iv)
            continue

        # Any other numeric subtype is treated conservatively as non-binary.
        return False

    return len(normalized) <= 2 and normalized.issubset({0, 1})


def _normalize_col_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(name).lower()).strip()


def _find_mentioned_columns(query: str, columns: List[str]) -> List[str]:
    """Find schema columns explicitly mentioned in the natural language query."""
    q = _normalize_col_name(query)
    mentioned: List[str] = []
    for col in columns:
        norm = _normalize_col_name(col)
        if not norm:
            continue
        # Match full normalized phrase or all tokens present
        if norm in q or all(tok in q.split() for tok in norm.split() if tok):
            mentioned.append(col)
    return mentioned


def _infer_metric_from_query(query: str, df: pd.DataFrame) -> Optional[str]:
    """Infer a numeric metric column from query language using semantic matching."""
    q = _normalize_col_name(query)
    numeric_cols = [col for col in df.columns if pd.api.types.is_numeric_dtype(df[col])]
    if not numeric_cols:
        return None

    # Prefer explicit business intent terms first.
    keyword_groups = [
        {
            "triggers": ["revenue", "sales", "income", "earnings", "arr", "mrr", "gmv"],
            "keywords": ["revenue", "sales", "amount", "income", "earnings", "arr", "mrr", "gmv"],
        },
        {
            "triggers": ["profit", "margin", "loss"],
            "keywords": ["profit", "margin", "gain", "loss", "contribution"],
        },
        {
            "triggers": ["cost", "expense", "charges", "price", "spend", "spending"],
            "keywords": ["cost", "expense", "charges", "price", "spend", "amount"],
        },
        {
            "triggers": ["order", "orders", "volume", "transaction", "transactions", "count"],
            "keywords": ["orders", "order", "volume", "transaction", "count", "quantity"],
        },
        {
            "triggers": ["churn", "attrition", "retention", "retained", "stayed", "cancel", "cancellation"],
            "keywords": ["churn", "attrition", "retention", "cancelled", "status", "target"],
        },
    ]

    try:
        from app.services.analytics.semantic_resolver import find_column
    except Exception:
        find_column = None

    for group in keyword_groups:
        if any(trigger in q for trigger in group["triggers"]):
            if find_column:
                matched = find_column(group["keywords"], numeric_cols)
                if matched:
                    return matched

            # Fallback lightweight token matching without semantic_resolver.
            for col in numeric_cols:
                col_norm = _normalize_col_name(col)
                if any(kw in col_norm for kw in group["keywords"]):
                    return col

    # Generic fallback: first numeric column explicitly mentioned by user.
    mentioned_numeric = _find_mentioned_columns(query, numeric_cols)
    if mentioned_numeric:
        return mentioned_numeric[0]

    return None


def _infer_target_from_query_keywords(query: str, df: pd.DataFrame) -> Optional[str]:
    """Infer target/outcome column directly from outcome wording in the query."""
    q = _normalize_col_name(query)
    outcome_terms = [
        "churn", "attrition", "retention", "retained", "stayed", "cancel", "cancellation",
        "conversion", "converted", "default", "status", "outcome", "label", "target",
    ]

    if not any(term in q for term in outcome_terms):
        return None

    candidate_keywords = [
        "churn", "attrition", "retention", "cancel", "status", "outcome", "target", "label", "conversion", "default",
    ]

    for col in df.columns:
        col_norm = _normalize_col_name(col)
        if any(kw in col_norm for kw in candidate_keywords):
            return col

    return None


# ─── Diagnostic query generators ──────────────────────────────────────────────

def _build_diagnostic_queries(
    df: pd.DataFrame,
    target_col: str,
    metric_col: Optional[str],
    dimensions: List[str],
) -> List[Dict[str, Any]]:
    """
    Generate up to 5 diagnostic aggregations to investigate
    why a metric or target behaves a certain way.
    """
    queries = []

    # If no metric:
    # - Use mean(target) for binary targets (gives rate)
    # - Else use count for generic volume diagnostics
    if metric_col:
        agg_expr = "mean"
        agg_col = metric_col
    else:
        if target_col in df.columns and _is_binary_numeric(df[target_col]):
            agg_expr = "mean"
            agg_col = target_col
        else:
            agg_expr = "count"
            agg_col = target_col

    for dim in dimensions[:5]:  # Max 5 single dimensions
        queries.append({
            "id": f"diag_{dim}",
            "title": f"{agg_col} by {dim}",
            "group_by": [dim],
            "metric": agg_col,
            "aggregation": agg_expr,
        })

    # Add pairwise combinations for complex driver analysis.
    combo_seed = dimensions[:4]
    combo_count = 0
    for i in range(len(combo_seed)):
        for j in range(i + 1, len(combo_seed)):
            if combo_count >= 3:
                break
            d1 = combo_seed[i]
            d2 = combo_seed[j]
            queries.append({
                "id": f"diag_{d1}__{d2}",
                "title": f"{agg_col} by {d1} x {d2}",
                "group_by": [d1, d2],
                "metric": agg_col,
                "aggregation": agg_expr,
            })
            combo_count += 1
        if combo_count >= 3:
            break

    return queries


def _build_sql_for_diagnostic(query: Dict[str, Any], table_name: str = "data") -> Dict[str, str]:
    """Build deterministic SQL for a diagnostic query spec."""
    group_cols = query.get("group_by") or []
    metric = query.get("metric")
    agg = str(query.get("aggregation") or "count").lower()

    if isinstance(group_cols, str):
        group_cols = [group_cols]
    if not group_cols:
        raise ValueError("Diagnostic query missing group_by columns")

    dim_alias = _dimension_alias(group_cols)
    quoted_table = _quote_identifier(table_name)
    quoted_group = [_quote_identifier(c) for c in group_cols]

    if len(group_cols) == 1:
        dim_expr = f"COALESCE(CAST({quoted_group[0]} AS VARCHAR), 'Unknown') AS {_quote_identifier(dim_alias)}"
        group_by_expr = quoted_group[0]
    else:
        part_expr = " || ' | ' || ".join(
            [f"COALESCE(CAST({col} AS VARCHAR), 'Unknown')" for col in quoted_group]
        )
        dim_expr = f"{part_expr} AS {_quote_identifier(dim_alias)}"
        group_by_expr = ", ".join(quoted_group)

    if agg == "count":
        value_expr = "COUNT(*)"
        where_clause = ""
    else:
        if metric is None or str(metric).strip() == "":
            raise ValueError(
                f"Diagnostic query '{query.get('id', 'unknown')}' is missing metric for aggregation '{agg}'"
            )

        metric_name = str(metric).strip()
        quoted_metric = _quote_identifier(metric_name)
        metric_cast = f"TRY_CAST({quoted_metric} AS DOUBLE)"
        if agg in {"mean", "avg"}:
            value_expr = f"AVG({metric_cast})"
        elif agg == "sum":
            value_expr = f"SUM({metric_cast})"
        elif agg == "min":
            value_expr = f"MIN({metric_cast})"
        elif agg == "max":
            value_expr = f"MAX({metric_cast})"
        else:
            value_expr = f"AVG({metric_cast})"
        where_clause = f"WHERE {metric_cast} IS NOT NULL"

    sql = (
        f"SELECT {dim_expr}, {value_expr} AS value "
        f"FROM {quoted_table} "
        f"{where_clause} "
        f"GROUP BY {group_by_expr} "
        f"ORDER BY value DESC "
        f"LIMIT 10"
    )
    return {
        "sql": sql,
        "dimension": dim_alias,
    }


def _execute_diagnostic(
    df: pd.DataFrame,
    query: Dict[str, Any],
) -> Dict[str, Any]:
    """Execute a single diagnostic aggregation on the dataframe."""
    try:
        group_cols = query["group_by"]
        metric = query["metric"]
        agg = query["aggregation"]

        if isinstance(group_cols, str):
            group_cols = [group_cols]

        for col in group_cols:
            if col not in df.columns:
                return {"id": query["id"], "error": f"Column '{col}' not found"}

        dim_alias = _dimension_alias(group_cols)

        if agg == "count":
            result = df.groupby(group_cols, dropna=False).size().reset_index(name="value")
        else:
            if metric not in df.columns:
                return {"id": query["id"], "error": f"Metric '{metric}' not found"}
            result = df.groupby(group_cols, dropna=False)[metric].agg(agg).reset_index(name="value")

        # Normalize grouped dimensions into a single label column so downstream
        # formatting can treat 1D and 2D diagnostics uniformly.
        if len(group_cols) == 1:
            source_col = group_cols[0]
            result[dim_alias] = result[source_col].fillna("Unknown").astype(str)
        else:
            parts = [result[c].fillna("Unknown").astype(str) for c in group_cols]
            combined = parts[0]
            for p in parts[1:]:
                combined = combined + " | " + p
            result[dim_alias] = combined

        result = result[[dim_alias, "value"]]

        # Sort descending and take top 10
        result = result.sort_values("value", ascending=False).head(10)

        return {
            "id": query["id"],
            "title": query["title"],
            "dimension": dim_alias,
            "data": result.to_dict(orient="records"),
            "chart_type": "bar",
        }
    except Exception as e:
        logger.warning(f"Diagnostic query failed for {query['id']}: {e}")
        return {"id": query["id"], "error": str(e)}


async def _execute_diagnostic_sql(
    db_engine,
    query: Dict[str, Any],
) -> Dict[str, Any]:
    """Execute a single diagnostic aggregation using SQL against DuckDB."""
    try:
        sql_bundle = _build_sql_for_diagnostic(query, table_name="data")
        sql = sql_bundle["sql"]
        dim = sql_bundle["dimension"]

        df_res = await db_engine.execute_query(sql, timeout_seconds=20)
        if dim not in df_res.columns:
            return {
                "id": query["id"],
                "error": f"SQL result missing expected dimension column '{dim}'",
            }

        if "value" not in df_res.columns:
            return {
                "id": query["id"],
                "error": "SQL result missing expected value column",
            }

        df_res[dim] = df_res[dim].fillna("Unknown").astype(str)
        data = df_res[[dim, "value"]].to_dict(orient="records")

        return {
            "id": query["id"],
            "title": query["title"],
            "dimension": dim,
            "data": data,
            "chart_type": "bar",
            "sql": sql,
        }
    except Exception as e:
        logger.warning(f"SQL diagnostic query failed for {query['id']}: {e}")
        return {"id": query["id"], "error": str(e)}


async def _execute_diagnostic_batch_sql(
    df: pd.DataFrame,
    diag_queries: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Execute a full diagnostic batch in SQL mode using a transient DuckDB engine."""
    from app.services.analytics.db_engine import DBEngine

    engine = DBEngine(db_path=":memory:")
    try:
        engine.load_dataframe("data", df)
        out: List[Dict[str, Any]] = []
        for q in diag_queries:
            out.append(await _execute_diagnostic_sql(engine, q))
        return out
    finally:
        engine.close()


async def run_diagnostic_battery(
    df: pd.DataFrame,
    query: str,
    target_col: Optional[str] = None,
    metric_col: Optional[str] = None,
    execution_mode: str = "sql",
) -> Dict[str, Any]:
    """
    Run a full diagnostic battery for an interpretive question.

    Returns:
        {
            "diagnostics": [{"id", "title", "dimension", "data", "chart_type"}, ...],
            "target": str,
            "metric": str|None,
            "synthesis_context": str  # Pre-formatted text for LLM synthesis
        }
    """
    mentioned_cols = _find_mentioned_columns(query, list(df.columns))

    # Auto-detect metric if not supplied and query names a numeric column.
    if not metric_col:
        metric_col = _infer_metric_from_query(query, df)

    if not metric_col:
        for col in mentioned_cols:
            if pd.api.types.is_numeric_dtype(df[col]):
                metric_col = col
                break

    # Auto-detect target if not given.
    if not target_col:
        target_col = _infer_target_from_query_keywords(query, df)

    if not target_col:
        # 1) Prefer query-mentioned low-cardinality categorical/bool or binary numeric columns.
        for col in mentioned_cols:
            nunique = df[col].dropna().nunique()
            if pd.api.types.is_numeric_dtype(df[col]):
                if _is_binary_numeric(df[col]):
                    target_col = col
                    break
            elif nunique <= 20:
                target_col = col
                break

    if not target_col:
        # 2) Prefer common outcome/status-like columns if present.
        target_keywords = ['outcome', 'status', 'default', 'converted', 'target', 'label', 'segment', 'class', 'category']
        for col in df.columns:
            if any(kw in col.lower() for kw in target_keywords):
                nunique = df[col].dropna().nunique()
                if nunique <= 20:
                    target_col = col
                    break

    if not target_col:
        # 3) Fallback: first categorical/bool with low cardinality.
        for col in df.select_dtypes(include=['object', 'category', 'bool']).columns:
            if df[col].dropna().nunique() <= 20:
                target_col = col
                break

    if not target_col:
        # 4) Final fallback: numeric binary target.
        for col in df.select_dtypes(include=['number']).columns:
            if _is_binary_numeric(df[col]):
                target_col = col
                break

    if not target_col and metric_col:
        # Use metric column as anchor so diagnostics still run for generic "why" queries.
        target_col = metric_col

    if not target_col:
        return {
            "diagnostics": [],
            "target": None,
            "metric": metric_col,
            "synthesis_context": "No suitable target column found for diagnostic analysis.",
        }

    # Pick dimensions: all categoricals except the target, low cardinality
    dimensions = [
        col for col in df.select_dtypes(include=['object', 'category']).columns
        if col != target_col and df[col].dropna().nunique() <= 20 and "id" not in col.lower()
    ]

    # Prioritize dimensions explicitly mentioned by the user query.
    if mentioned_cols:
        mentioned_set = set(mentioned_cols)
        dimensions = sorted(dimensions, key=lambda c: (0 if c in mentioned_set else 1, c))

    # Also consider numeric columns with low cardinality (binned)
    for col in df.select_dtypes(include=['number']).columns:
        if col != metric_col and col != target_col and df[col].dropna().nunique() <= 10 and "id" not in col.lower():
            dimensions.append(col)

    if not dimensions:
        return {
            "diagnostics": [],
            "target": target_col,
            "metric": metric_col,
            "synthesis_context": "No suitable dimensions found for diagnostic breakdown.",
        }

    # Build and execute diagnostics
    diag_queries = _build_diagnostic_queries(df, target_col, metric_col, dimensions)
    if execution_mode == "sql":
        results = await _execute_diagnostic_batch_sql(df, diag_queries)
        successful_sql = [r for r in results if "error" not in r]
        if not successful_sql:
            logger.warning("SQL diagnostic batch returned no successful results; falling back to pandas diagnostics")
            results = [_execute_diagnostic(df, q) for q in diag_queries]
    else:
        results = [_execute_diagnostic(df, q) for q in diag_queries]

    successful = [r for r in results if "error" not in r]

    # Build synthesis context for LLM
    context_lines = [f"User question: {query}", f"Target: {target_col}", ""]
    for diag in successful:
        context_lines.append(f"### {diag['title']}")
        for row in diag["data"][:5]:
            dim_val = row.get(diag['dimension'], "N/A")
            val = row.get('value', 0)
            if isinstance(val, (int, float)):
                val_str = "{:.2f}".format(val)
            else:
                val_str = str(val)
            context_lines.append(f"  - {dim_val}: {val_str}")
        context_lines.append("")

    return {
        "diagnostics": successful,
        "target": target_col,
        "metric": metric_col,
        "synthesis_context": "\n".join(context_lines),
    }
