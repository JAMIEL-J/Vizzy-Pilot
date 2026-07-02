"""
NL2SQL Chart Spec Builder.

Converts raw NL2SQL executor output (data rows + chart_type hint)
into structured chart specifications matching the frontend format.

This bridges the gap between:
  - Executor output: {"data": [...], "chart_type": "bar", "columns": [...]}
  - Frontend expect: {"chart": {"type": "bar", "title": "...", "data": {"rows": [...]}}}
"""

import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _currency_symbol_from_code(code: Optional[str]) -> str:
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


def _currency_symbol_for_metric(metric_col: Optional[str], column_metadata: Optional[Dict[str, Any]]) -> str:
    metadata = column_metadata or {}
    if metric_col and metric_col in metadata:
        display_format = metadata.get(metric_col, {}).get("display_format", {})
        if isinstance(display_format, dict) and display_format.get("type") == "currency":
            return _currency_symbol_from_code(display_format.get("currency"))
    return "$"


def _is_currency_metric(label: str, metric_col: Optional[str], column_metadata: Optional[Dict[str, Any]]) -> bool:
    """Infer whether a metric should be displayed as currency."""
    metadata = column_metadata or {}
    if metric_col and metric_col in metadata:
        display_format = metadata.get(metric_col, {}).get("display_format", {})
        if isinstance(display_format, dict) and display_format.get("type") == "currency":
            return True

    metric_text = (metric_col or "").lower()
    if any(k in metric_text for k in ["quantity", "qty", "count", "unit", "units", "volume"]):
        return False

    text = f"{label or ''} {metric_col or ''}".lower()
    currency_keywords = [
        "revenue", "profit", "income", "earnings", "cost", "expense",
        "price", "charges", "charge", "payment", "budget", "salary", "wage",
        "fee", "sales", "discount", "amount", "spent", "spend",
        "spending", "mrr", "arr", "billing", "bill"
    ]
    return any(kw in text for kw in currency_keywords)


def _humanize_label(value: str) -> str:
    return str(value or "").replace("_", " ").strip().title()


def _is_whole_number_metric(*candidates: Optional[str]) -> bool:
    token = " ".join(str(candidate or "").lower() for candidate in candidates)
    keywords = ["age", "tenure", "duration", "day", "days", "month", "months", "year", "years", "los", "length of stay", "lengthofstay"]
    return any(keyword in token for keyword in keywords)


def _infer_value_label(value_col: Optional[str], title: Optional[str], y_axis: Optional[str]) -> str:
    # 1. Use y_axis if explicitly specified and not a generic time aggregation/trend word
    if y_axis:
        y_axis_lower = str(y_axis).lower()
        if not any(t in y_axis_lower for t in ["monthly", "yearly", "weekly", "daily", "trend"]):
            if "age" in y_axis_lower:
                return "Age"
            if "tenure" in y_axis_lower:
                return "Months"
            if "year" in y_axis_lower:
                return "Years"
            if "day" in y_axis_lower or "los" in y_axis_lower or "length of stay" in y_axis_lower:
                return "Days"
            return _humanize_label(y_axis)

    # 2. Otherwise use the column name/alias from the query (value_col)
    v_col_lower = str(value_col or "").lower()
    if "age" in v_col_lower:
        return "Age"
    if "tenure" in v_col_lower:
        return "Months"
    if "year" in v_col_lower:
        return "Years"
    if "day" in v_col_lower or "los" in v_col_lower or "length of stay" in v_col_lower:
        return "Days"

    return _humanize_label(value_col or "Value")


def _normalize_metric_value(value: Any, use_whole_number: bool) -> Any:
    if not isinstance(value, (int, float)):
        return value
    return int(round(float(value))) if use_whole_number else value


def _auto_chart_type(chart_type: str, data: List[Dict[str, Any]], columns: List[str]) -> str:
    """Upgrade generic chart hints to better chart types based on result shape."""
    if not data or not columns:
        return chart_type

    first_row = data[0] if isinstance(data[0], dict) else {}
    numeric_cols = [c for c in columns if isinstance(first_row.get(c), (int, float))]
    non_numeric_cols = [c for c in columns if c not in numeric_cols]

    # If there is exactly one row and all columns are numeric, it should render as a KPI.
    if len(data) == 1 and len(numeric_cols) >= 1 and len(non_numeric_cols) == 0:
        return "kpi"

    # Multi-metric category comparisons should render as stacked bars.
    if len(non_numeric_cols) >= 1 and len(numeric_cols) >= 2 and chart_type in {"bar", "table", "stacked"}:
        return "stacked_bar"

    # Top-N/tabular category comparisons are better as bars than raw tables.
    if len(non_numeric_cols) >= 1 and len(numeric_cols) == 1 and chart_type == "table":
        return "bar"

    return chart_type


def _extract_top_n(title: str) -> Optional[int]:
    """Extract top-N target from chart title if present (e.g., 'Top 10 Products')."""
    match = re.search(r"\btop\s+(\d+)\b", str(title or ""), flags=re.IGNORECASE)
    if not match:
        return None

    try:
        n = int(match.group(1))
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def _format_compact_number(value: Any, is_currency: bool = False, symbol: str = "$") -> str:
    """Format a number into compact K/M/B notation."""
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
        return f"{symbol}{base}" if is_currency else base

    decimals = 2 if num < 10 else (1 if num < 100 else 0)
    formatted = f"{sign}{num:.{decimals}f}"
    if "." in formatted:
        formatted = formatted.rstrip("0").rstrip(".")
    compact = formatted + suffix
    return f"{symbol}{compact}" if is_currency else compact


def _format_insight_value(
    value: Any,
    column_name: str = "",
    column_metadata: Optional[Dict[str, Any]] = None,
    title: str = "",
) -> str:
    """Format a value for display in key insight text — handles %, currency, and plain numbers."""
    if not isinstance(value, (int, float)):
        return str(value)

    is_pct = _is_likely_percentage(column_name) or _is_likely_percentage(title)
    is_curr = not is_pct and _is_currency_metric(title, column_name, column_metadata)

    # Scale ratio values (0.2674 → 26.74) for percentage display
    display_val = value
    if is_pct and -1.0 <= value <= 1.0:
        display_val = value * 100

    if is_pct:
        base = f"{display_val:.1f}"
        base = base.rstrip("0").rstrip(".")
        return f"{base}%"

    if is_curr:
        symbol = _currency_symbol_for_metric(column_name, column_metadata)
        return _format_compact_number(display_val, is_currency=True, symbol=symbol)

    return _format_compact_number(display_val, is_currency=False)


def build_chart_from_nl2sql(nl2sql_result: dict) -> Dict[str, Any]:
    """
    Transform NL2SQL executor output into a frontend-compatible chart spec.

    Returns:
        {
            "chart": {
                "type": "bar|line|pie|kpi|table",
                "title": "...",
                "data": { "rows": [...] | "series": [...] | "value": ... },
                "axes": { "x": "...", "y": "..." }
            },
            "explanation": { "summary": "...", "detailed": "...", ... },
            "followup_suggestions": [...]
        }
    """
    data = nl2sql_result.get("data", [])
    columns = nl2sql_result.get("columns", [])
    chart_type = nl2sql_result.get("chart_type", "table")
    title = nl2sql_result.get("title", "Analysis Result")
    x_axis = nl2sql_result.get("x_axis", "")
    y_axis = nl2sql_result.get("y_axis", "")
    explanation_text = nl2sql_result.get("explanation", "")

    column_metadata = nl2sql_result.get("column_metadata", {})

    if not data:
        return _empty_result(title)

    # Route to chart-type-specific builder
    chart_type = _auto_chart_type(chart_type, data, columns)

    builders = {
        "kpi": _build_kpi,
        "bar": _build_bar,
        "stacked_bar": _build_stacked_bar,
        "stacked": _build_stacked_bar,
        "line": _build_line,
        "pie": _build_pie,
        "table": _build_table,
    }

    builder = builders.get(chart_type, _build_table)
    chart_spec = builder(data, columns, title, x_axis, y_axis, column_metadata)
    
    # Attach column metadata for frontend formatting
    chart_spec["column_metadata"] = {
        col: column_metadata.get(col, {})
        for col in columns
    }

    return {
        "chart": chart_spec,
        "explanation": {
            "summary": explanation_text or title,
            "detailed": explanation_text,
            "key_insight": _extract_key_insight(data, chart_type, columns, column_metadata, title),
        },
        "followup_suggestions": _suggest_followups(chart_type),
    }


# ─── Chart Builders ──────────────────────────────────────────────────────────


def _build_kpi(data: list, columns: list, title: str, x_axis: str, y_axis: str, column_metadata: Optional[Dict[str, Any]] = None) -> dict:
    """KPI: single number result."""
    row = data[0] if data else {}
    value = None
    label = title
    metrics = []
    
    # Check for a string column (e.g., the top winning category name)
    category_context = None
    for col in columns:
        val = row.get(col)
        if isinstance(val, str) and not category_context:
            category_context = val

    # Find numeric values (all of them for multi-metric KPI cards)
    primary_set = False
    for col in columns:
        val = row.get(col)
        if isinstance(val, (int, float)):
            is_percentage = _is_likely_percentage(col)
            metric_value = val * 100 if is_percentage and -1.0 <= val <= 1.0 else val
            if not is_percentage:
                metric_value = _normalize_metric_value(metric_value, _is_whole_number_metric(col, title, y_axis))
            metrics.append({
                "key": col,
                "label": _humanize_label(col),
                "value": metric_value,
                "is_percentage": is_percentage,
                "format_type": "percentage" if is_percentage else ("currency" if _is_currency_metric(title or col, col, column_metadata) else "number"),
                "suffix": "%" if is_percentage else "",
            })
            if not primary_set:
                value = val
                label = (col.replace("_", " ").title() if not title else title)
                if category_context:
                    label = f"{category_context} ({label})"
                primary_set = True

    if value is None:
        # Fallback: first value regardless of type
        value = list(row.values())[0] if row else 0
        if category_context and value != category_context:
            label = f"{category_context} ({label})"

    # Smart detection for rates, margins, and percentages
    is_percentage = _is_likely_percentage(label)
    
    suffix = ""
    # If it's a percentage and value is a small ratio (e.g., 0.11), convert to percentage (11.0)
    if is_percentage and isinstance(value, (int, float)) and -1.0 <= value <= 1.0:
        value = value * 100
        suffix = "%"
    elif is_percentage:
        suffix = "%"
    elif isinstance(value, (int, float)):
        value = _normalize_metric_value(value, _is_whole_number_metric(label, title, y_axis))

    return {
        "type": "kpi",
        "title": title,
        "data": {
            "value": value, 
            "label": label, 
            "suffix": suffix,
            "is_percentage": is_percentage,
            "metrics": metrics,
        },
    }


def _is_likely_percentage(label: str) -> bool:
    """Detect if a label refers to a percentage metric vs a count."""
    label_lower = label.lower()
    
    # Keywords that strongly suggest a percentage/rate
    rate_keywords = ["rate", "percent", "percentage", "margin", "ratio", "share", "portion", "probability"]
    
    # Keywords that suggest an absolute count (even if combined with other words)
    count_keywords = ["total", "count", "number", "sum", "amount", "users", "customers", "records"]
    
    # Special case: churn
    is_churn_rate = "churn" in label_lower and ("rate" in label_lower or "percent" in label_lower or "%" in label_lower)
    
    if is_churn_rate:
        return True
    
    has_rate_kw = any(kw in label_lower for kw in rate_keywords)
    has_count_kw = any(kw in label_lower for kw in count_keywords)
    
    # If it has rate-like keywords but NO count-like keywords, it's likely a percentage
    if has_rate_kw and not has_count_kw:
        return True
        
    return False


def _build_bar(data: list, columns: list, title: str, x_axis: str, y_axis: str, column_metadata: Optional[Dict[str, Any]] = None) -> dict:
    """Bar chart: category column + value column."""
    category_col, value_col = _detect_category_value_cols(columns, data)

    # Detect if value column is a percentage
    is_percentage = _is_likely_percentage(value_col)
    value_label = _infer_value_label(value_col, title, y_axis)
    use_whole_number = _is_whole_number_metric(value_col, title, y_axis, value_label)

    rows = []
    for row in data:
        val = row.get(value_col, 0)
        # Scale if it's a ratio
        if is_percentage and isinstance(val, (int, float)) and -1.0 <= val <= 1.0:
            val = val * 100
        elif isinstance(val, (int, float)):
            val = _normalize_metric_value(val, use_whole_number)
            
        rows.append({
            category_col: str(row.get(category_col, "")),
            value_col: val,
        })

    top_n = _extract_top_n(title)
    if top_n and len(rows) > top_n:
        rows = sorted(rows, key=lambda r: r.get(value_col, 0) if isinstance(r.get(value_col), (int, float)) else 0, reverse=True)[:top_n]

    format_type = "percentage" if is_percentage else ("currency" if _is_currency_metric(title, value_col, column_metadata) else "number")

    return {
        "type": "bar",
        "title": title,
        "data": {"rows": rows, "is_percentage": is_percentage},
        "format_type": format_type,
        "value_label": value_label,
        "metric": value_col,
        "dimension": category_col,
        "axes": {
            "x": x_axis or _humanize_label(category_col),
            "y": y_axis or value_label,
        },
    }


def _build_stacked_bar(data: list, columns: list, title: str, x_axis: str, y_axis: str, column_metadata: Optional[Dict[str, Any]] = None) -> dict:
    """Stacked bar: one category column + multiple numeric metric columns."""
    if not data or not columns:
        return _build_table(data, columns, title, x_axis, y_axis, column_metadata)

    first_row = data[0] if isinstance(data[0], dict) else {}
    numeric_cols = [c for c in columns if isinstance(first_row.get(c), (int, float))]
    category_candidates = [c for c in columns if c not in numeric_cols]

    # Fallback to basic bar if shape is not suitable for stacked output.
    if len(category_candidates) < 1 or len(numeric_cols) < 2:
        return _build_bar(data, columns, title, x_axis, y_axis, column_metadata)

    category_col = category_candidates[0]
    metric_cols = numeric_cols

    rows = []
    for row in data:
        stacked_row = {category_col: str(row.get(category_col, ""))}
        for metric in metric_cols:
            val = row.get(metric, 0)
            stacked_row[metric] = val if isinstance(val, (int, float)) else 0
        rows.append(stacked_row)

    top_n = _extract_top_n(title)
    if top_n and len(rows) > top_n:
        rows = sorted(
            rows,
            key=lambda r: sum(r.get(metric, 0) for metric in metric_cols if isinstance(r.get(metric), (int, float))),
            reverse=True,
        )[:top_n]

    all_currency = all(_is_currency_metric(title, metric, column_metadata) for metric in metric_cols)
    any_percentage = any(_is_likely_percentage(metric) for metric in metric_cols)
    format_type = "percentage" if any_percentage else ("currency" if all_currency else "number")

    return {
        "type": "stacked_bar",
        "title": title,
        "data": {
            "rows": rows,
            "categories": metric_cols,
        },
        "categories": metric_cols,
        "format_type": format_type,
        "dimension": category_col,
        "axes": {
            "x": x_axis or category_col.replace("_", " ").title(),
            "y": y_axis or "Value",
        },
    }


def _build_line(data: list, columns: list, title: str, x_axis: str, y_axis: str, column_metadata: Optional[Dict[str, Any]] = None) -> dict:
    """Line chart: time/ordered column + value column."""
    time_col, value_col = _detect_time_value_cols(columns, data)

    # Detect if value column is a percentage
    is_percentage = _is_likely_percentage(value_col)
    value_label = _infer_value_label(value_col, title, y_axis)
    use_whole_number = _is_whole_number_metric(value_col, title, y_axis, value_label)

    series = []
    for row in data:
        timestamp = row.get(time_col, "")
        val = row.get(value_col, 0)
        # Scale if it's a ratio
        if is_percentage and isinstance(val, (int, float)) and -1.0 <= val <= 1.0:
            val = val * 100
        elif isinstance(val, (int, float)):
            val = _normalize_metric_value(val, use_whole_number)
            
        if timestamp is not None:
            series.append({
                "timestamp": str(timestamp),
                "value": val if isinstance(val, (int, float)) else 0,
            })

    return {
        "type": "line",
        "title": title,
        "data": {"series": series, "is_percentage": is_percentage},
        "value_label": value_label,
        "metric": value_col,
        "dimension": time_col,
        "axes": {
            "x": x_axis or _humanize_label(time_col),
            "y": y_axis or value_label,
        },
    }


def _build_pie(data: list, columns: list, title: str, x_axis: str, y_axis: str, column_metadata: Optional[Dict[str, Any]] = None) -> dict:
    """Pie chart: same structure as bar but rendered as pie."""
    category_col, value_col = _detect_category_value_cols(columns, data)

    rows = []
    for row in data:
        rows.append({
            category_col: str(row.get(category_col, "")),
            value_col: row.get(value_col, 0),
        })

    return {
        "type": "pie",
        "title": title,
        "data": {"rows": rows},
    }


def _build_table(data: list, columns: list, title: str, x_axis: str, y_axis: str, column_metadata: Optional[Dict[str, Any]] = None) -> dict:
    """Table: raw data rows."""
    return {
        "type": "table",
        "title": title,
        "data": {
            "columns": columns,
            "rows": data,
        },
    }


# ─── Column Detection Helpers ────────────────────────────────────────────────


def _score_time_col(col: str, data: list) -> float:
    score = 0.0
    col_lower = col.lower()
    
    # Exact keyword match gets very high score
    exact_time_keywords = {"date", "time", "month", "year", "week", "quarter", "day", "period", "dt", "timestamp", "epoch"}
    if col_lower in exact_time_keywords:
        score += 10.0
        
    # Check word boundaries or common prefixes/suffixes for time
    parts = col_lower.split('_')
    for part in parts:
        if part in exact_time_keywords:
            score += 5.0
            
    # Substring match (fallback, lower score)
    time_substring_keywords = ["date", "time", "month", "year", "week", "quarter", "day", "period"]
    if any(kw in col_lower for kw in time_substring_keywords):
        score += 2.0
        
    # Check data values
    date_like_values = 0
    total_non_null = 0
    for row in data[:50]:  # inspect first 50 rows
        if not isinstance(row, dict):
            continue
        v = row.get(col)
        if v is None:
            continue
        total_non_null += 1
        v_str = str(v).strip()
        # YYYY-MM-DD or YYYY/MM/DD
        if re.match(r'^\d{4}[-/]\d{2}[-/]\d{2}$', v_str):
            date_like_values += 1
        # YYYY-MM or YYYY/MM
        elif re.match(r'^\d{4}[-/]\d{2}$', v_str):
            date_like_values += 1
        # MM/DD/YYYY
        elif re.match(r'^\d{1,2}[-/]\d{1,2}[-/]\d{4}$', v_str):
            date_like_values += 1
            
    if total_non_null > 0:
        ratio = date_like_values / total_non_null
        if ratio > 0.8:
            score += 15.0
            
    # Penalize if it contains metric-like keywords
    metric_keywords = ["revenue", "sales", "count", "amount", "total", "price", "profit", "qty", "quantity", "cost", "sum", "avg", "min", "max", "value"]
    if any(kw in col_lower for kw in metric_keywords):
        score -= 10.0
        
    # Penalize if the data values are floats
    float_values = 0
    for row in data[:50]:
        if not isinstance(row, dict):
            continue
        v = row.get(col)
        if v is None:
            continue
        if isinstance(v, float):
            float_values += 1
        elif isinstance(v, (int, str)):
            try:
                if '.' in str(v):
                    float(v)
                    float_values += 1
            except ValueError:
                pass
    if total_non_null > 0:
        float_ratio = float_values / total_non_null
        if float_ratio > 0.8:
            score -= 10.0
            
    return score


def _score_value_col(col: str, data: list) -> float:
    score = 0.0
    col_lower = col.lower()
    
    # Check data values (very strong indicator)
    numeric_values = 0
    total_non_null = 0
    for row in data[:50]:
        if not isinstance(row, dict):
            continue
        v = row.get(col)
        if v is None:
            continue
        total_non_null += 1
        if isinstance(v, (int, float)):
            numeric_values += 1
        else:
            try:
                float(v)
                numeric_values += 1
            except ValueError:
                pass
                
    if total_non_null > 0:
        ratio = numeric_values / total_non_null
        if ratio > 0.8:
            score += 10.0
            
    # Metric keywords match
    metric_keywords = ["revenue", "sales", "count", "amount", "total", "price", "profit", "qty", "quantity", "cost", "sum", "avg", "min", "max", "value"]
    if any(kw in col_lower for kw in metric_keywords):
        score += 8.0
        
    # Penalize time keywords
    time_keywords = ["date", "time", "month", "year", "week", "quarter", "day", "period", "dt", "timestamp"]
    if any(kw in col_lower for kw in time_keywords):
        score -= 8.0
        
    return score


def _detect_category_value_cols(columns: list, data: list) -> tuple:
    """Detect which column is the category and which is the value."""
    if len(columns) < 2:
        return (columns[0] if columns else "category", "value")

    value_scores = {col: _score_value_col(col, data) for col in columns}
    sorted_for_val = sorted(columns, key=lambda c: value_scores[c], reverse=True)
    value_col = sorted_for_val[0]
    
    remaining_cols = [c for c in columns if c != value_col]
    category_col = sorted(remaining_cols, key=lambda c: value_scores[c])[0]
    
    return (category_col, value_col)


def _detect_time_value_cols(columns: list, data: list) -> tuple:
    """Detect which column is time-based and which is the value."""
    if len(columns) < 2:
        return (columns[0] if columns else "time", "value")

    time_scores = {col: _score_time_col(col, data) for col in columns}
    sorted_cols = sorted(columns, key=lambda c: time_scores[c], reverse=True)
    time_col = sorted_cols[0]
    
    remaining_cols = [c for c in columns if c != time_col]
    value_scores = {col: _score_value_col(col, data) for col in remaining_cols}
    value_col = sorted(remaining_cols, key=lambda c: value_scores[c], reverse=True)[0]
    
    return (time_col, value_col)


# ─── Insight & Suggestion Helpers ────────────────────────────────────────────


def _extract_key_insight(
    data: list,
    chart_type: str,
    columns: list,
    column_metadata: Optional[Dict[str, Any]] = None,
    title: str = "",
) -> str:
    """Auto-generate a key insight from the data."""
    if not data:
        return "No data available."

    if chart_type == "kpi":
        row = data[0]
        for col in columns:
            val = row.get(col)
            if isinstance(val, (int, float)):
                fmt_val = _format_insight_value(val, column_name=col, column_metadata=column_metadata, title=title)
                return f"The result is {fmt_val}"
        return "Result computed."

    if chart_type in ("bar", "pie", "table", "stacked_bar", "stacked") and len(data) >= 2:
        _, value_col = _detect_category_value_cols(columns, data)
        # Pick the best category column among non-value columns — prefer the one
        # with the most non-numeric, non-time, short-string values.
        category_candidates = [c for c in columns if c != value_col]
        if len(category_candidates) > 1:
            cat_scores = {}
            for col in category_candidates:
                vals = [str(r.get(col, "")).strip() for r in data if r.get(col) is not None]
                unique_vals = len(set(vals))
                avg_len = sum(len(v) for v in vals) / max(len(vals), 1)
                cat_scores[col] = unique_vals - (avg_len / 20)  # favour moderate-length category names
            category_col = max(cat_scores, key=cat_scores.get)
        else:
            category_col = category_candidates[0] if category_candidates else columns[0]

        top_row = max(data, key=lambda r: r.get(value_col, 0) if isinstance(r.get(value_col), (int, float)) else 0)
        val = top_row.get(value_col, 0)
        fmt_val = _format_insight_value(val, column_name=value_col, column_metadata=column_metadata, title=title)
        
        # Build a clear, insight-driven one-liner
        category_value = str(top_row.get(category_col, 'Top item') or '').strip()
        if not category_value:
            category_value = 'Top item'
        # If it's a table but looks like a regular grouped list, give a top-item metric
        action_verb = "leads with" if chart_type != "table" else "is listed with highest value:"
        return f"{category_value} {action_verb} {fmt_val}."

    if chart_type == "line" and len(data) >= 3:
        time_col, value_col = _detect_time_value_cols(columns, data)
        
        # Extract numeric values
        values = [r.get(value_col) for r in data if isinstance(r.get(value_col), (int, float))]
        if len(values) >= 4:
            # Simple IQR anomaly detection without needing Pandas
            sorted_v = sorted(values)
            n = len(sorted_v)
            q1 = sorted_v[n // 4]
            q3 = sorted_v[(n * 3) // 4]
            iqr = q3 - q1
            upper_bound = q3 + 1.5 * iqr
            lower_bound = q1 - 1.5 * iqr
            
            anomalies = [r for r in data if isinstance(r.get(value_col), (int, float)) and (r.get(value_col) > upper_bound or r.get(value_col) < lower_bound)]
            
            if anomalies:
                # Report top anomaly
                top_anomaly = max(anomalies, key=lambda r: abs(r.get(value_col) - ((q1+q3)/2)))
                av = top_anomaly.get(value_col)
                fmt_val = _format_insight_value(av, column_name=value_col, column_metadata=column_metadata, title=title)
                direction = "spike" if av > q3 else "drop"
                return f"Detected {len(anomalies)} anomalies. Notable {direction} on {top_anomaly.get(time_col, 'date')} ({fmt_val})."
            else:
                return "The trend appears stable with no major anomalies detected."

    return f"Showing {len(data)} data points."


def _suggest_followups(chart_type: str) -> list:
    """Suggest follow-up questions based on chart type."""
    followups = {
        "kpi": [
            "How has this changed over time?",
            "Break this down by category",
            "Compare this to last period",
        ],
        "bar": [
            "Which category performs best?",
            "Show me this as a trend over time",
            "What's the total across all categories?",
        ],
        "stacked_bar": [
            "Which category has the highest combined total?",
            "Show this as grouped bars instead",
            "How do these metrics trend over time?",
        ],
        "line": [
            "What's the overall trend direction?",
            "Are there any anomalies?",
            "Break this down by category",
        ],
        "pie": [
            "Which segment is the largest?",
            "Show this as a bar chart instead",
            "What drives the top segment?",
        ],
        "table": [
            "Visualize this as a chart",
            "Filter to show only the top items",
            "Summarize this data",
        ],
    }
    return followups.get(chart_type, ["Tell me more", "Show a different view", "Summarize"])


def _empty_result(title: str) -> dict:
    """Return an empty result when no data is returned."""
    return {
        "chart": {
            "type": "kpi",
            "title": title,
            "data": {"value": 0, "label": "No results"},
        },
        "explanation": {
            "summary": "The query returned no data.",
            "detailed": "No matching records were found for this query. Try broadening your criteria.",
            "key_insight": "No data found.",
        },
        "followup_suggestions": [
            "Try a different question",
            "What data is available?",
            "Show me an overview dashboard",
        ],
    }
