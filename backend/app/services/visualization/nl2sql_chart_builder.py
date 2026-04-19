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
    merged = f"{value_col or ''} {title or ''} {y_axis or ''}".lower()
    if "age" in merged:
        return "Age"
    if "tenure" in merged or "month" in merged:
        return "Months"
    if "year" in merged:
        return "Years"
    if "day" in merged or "los" in merged or "length of stay" in merged:
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
    compact = f"{sign}{num:.{decimals}f}".rstrip("0").rstrip(".") + suffix
    return f"{symbol}{compact}" if is_currency else compact


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


def _detect_category_value_cols(columns: list, data: list) -> tuple:
    """Detect which column is the category and which is the value."""
    if len(columns) < 2:
        return (columns[0] if columns else "category", "value")

    row = data[0] if data else {}
    
    numeric_cols = []
    for col in columns:
        val = row.get(col)
        if isinstance(val, (int, float)):
            numeric_cols.append(col)
            
    if numeric_cols:
        # Prefer numeric columns that are NOT time/date as value_col
        time_keywords = ["year", "month", "day", "date", "quarter", "week", "id"]
        for col in numeric_cols:
            if not any(kw in col.lower() for kw in time_keywords):
                value_col = col
                category_col = [c for c in columns if c != col][0]
                return (category_col, value_col)
                
        # Fallback if all numeric cols are time-like (or no time-like check matched)
        value_col = numeric_cols[-1] # Pick the last numeric column as metric (most SQL queries put metric last)
        category_col = [c for c in columns if c != value_col][0]
        return (category_col, value_col)

    # Fallback: first = category, second = value
    return (columns[0], columns[1])


def _detect_time_value_cols(columns: list, data: list) -> tuple:
    """Detect which column is time-based and which is the value."""
    time_keywords = ["date", "time", "month", "year", "week", "quarter", "day", "period"]

    time_col = None
    for col in columns:
        if any(kw in col.lower() for kw in time_keywords):
            time_col = col
            break

    if time_col:
        value_col = [c for c in columns if c != time_col][0] if len(columns) > 1 else columns[0]
    else:
        # fallback: first col = x, second = y
        time_col = columns[0] if columns else "x"
        value_col = columns[1] if len(columns) > 1 else columns[0]

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
                is_currency = _is_currency_metric(title or col, col, column_metadata)
                currency_symbol = _currency_symbol_for_metric(col, column_metadata)
                fmt_val = _format_compact_number(val, is_currency=is_currency, symbol=currency_symbol)
                return f"The result is {fmt_val}"
        return "Result computed."

    if chart_type in ("bar", "pie", "table", "stacked_bar", "stacked") and len(data) >= 2:
        _, value_col = _detect_category_value_cols(columns, data)
        category_col = [c for c in columns if c != value_col][0] if len(columns) > 1 else columns[0]
        top_row = max(data, key=lambda r: r.get(value_col, 0) if isinstance(r.get(value_col), (int, float)) else 0)
        val = top_row.get(value_col, 0)
        is_currency = _is_currency_metric(title, value_col, column_metadata)
        currency_symbol = _currency_symbol_for_metric(value_col, column_metadata)
        fmt_val = _format_compact_number(val, is_currency=is_currency, symbol=currency_symbol)
        
        # If it's a table but looks like a regular grouped list, give a top-item metric
        action_verb = "leads with" if chart_type != "table" else "is listed with highest value:"
        return f"{top_row.get(category_col, 'Top item')} {action_verb} {fmt_val}."

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
                is_currency = _is_currency_metric(title, value_col, column_metadata)
                currency_symbol = _currency_symbol_for_metric(value_col, column_metadata)
                
                # Report top anomaly
                top_anomaly = max(anomalies, key=lambda r: abs(r.get(value_col) - ((q1+q3)/2)))
                av = top_anomaly.get(value_col)
                fmt_val = _format_compact_number(av, is_currency=is_currency, symbol=currency_symbol)
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
