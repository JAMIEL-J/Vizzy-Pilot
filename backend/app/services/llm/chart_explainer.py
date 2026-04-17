"""
Chart explanation generator module.

Belongs to: LLM services layer
Responsibility: Generate natural language explanations of charts using LLM
Restrictions: Returns explanation text only
"""

from typing import Any, Dict, List, Optional

from app.core.llm_client import get_llm_client, parse_json_response
from app.core.logger import get_logger


logger = get_logger(__name__)


def _format_number_value(value: Any, currency_symbol: Optional[str] = None) -> str:
    """Format numeric values consistently for explainer text."""
    try:
        num = float(value)
    except (TypeError, ValueError):
        return str(value)

    if currency_symbol:
        return f"{currency_symbol}{num:,.2f}"

    if abs(num - int(num)) < 1e-9:
        return f"{int(num):,}"

    return f"{num:,.2f}"


def _normalize_binary_label(label: Any, chart_title: Optional[str] = None) -> str:
    """Normalize binary-like labels for clearer business explanations."""
    raw = str(label).strip()
    if not raw:
        return raw

    low = raw.lower()
    title = (chart_title or '').lower()
    churn_like = any(tok in title for tok in ('churn', 'attrition', 'exit', 'retention'))

    if low in {'1', 'true', 'yes', 'y'}:
        return 'Churned' if churn_like else 'Yes'
    if low in {'0', 'false', 'no', 'n'}:
        return 'Retained' if churn_like else 'No'

    return raw


# System prompt for chart explanation
CHART_EXPLANATION_SYSTEM_PROMPT = """
You are an expert data analyst explaining chart insights to business users.

Your job is to generate clear, concise explanations of data visualizations.

Rules:
1. Start with what the chart shows (e.g., "This bar chart displays...")
2. Highlight the key insight (highest, lowest, trend)
3. Mention specific values with context
4. Keep explanation under 100 words
5. Use business-friendly language, avoid jargon
6. End with an actionable insight or observation

Output format:
{
  "summary": "One-sentence summary of what the chart shows",
  "explanation": "2-3 sentence detailed explanation with key insights",
  "key_insight": "The most important takeaway",
  "followup_questions": ["Question 1?", "Question 2?", "Question 3?"]
}
"""

def _build_chart_context(
    chart_type: str,
    chart_data: Dict[str, Any],
    user_query: str,
    currency_symbol: Optional[str] = None,
) -> str:
    """Build context string for LLM from chart data."""
    data_str = ""
    
    if chart_type == "bar":
        # Handle both x/y and rows formats
        x_values = chart_data.get("x", [])
        y_values = chart_data.get("y", [])
        
        if not x_values and "rows" in chart_data.get("data", {}):
            rows = chart_data["data"]["rows"]
            if rows:
                cols = list(rows[0].keys())
                x_col = cols[0]
                y_col = cols[1] if len(cols) > 1 else cols[0]
                x_values = [r.get(x_col) for r in rows]
                y_values = [r.get(y_col) for r in rows]

        chart_title = chart_data.get('title', 'Untitled')
        data_points = [
            f"{_normalize_binary_label(x, chart_title)}: {_format_number_value(y, currency_symbol)}"
            for x, y in zip(x_values[:10], y_values[:10])
        ]
        data_str = "\n".join(data_points)
        
    elif chart_type == "line":
        # Handle both x/y and series formats
        x_values = chart_data.get("x", [])
        y_values = chart_data.get("y", [])
        
        if not x_values and "series" in chart_data.get("data", {}):
            series = chart_data["data"]["series"]
            if series:
                cols = list(series[0].keys())
                x_col = cols[0]
                y_col = cols[1] if len(cols) > 1 else cols[0]
                x_values = [s.get(x_col) for s in series]
                y_values = [s.get(y_col) for s in series]

        # Show first, last, and a few middle points
        if len(x_values) > 5:
            indices = [0, len(x_values)//4, len(x_values)//2, 3*len(x_values)//4, -1]
            chart_title = chart_data.get('title', 'Untitled')
            data_points = [
                f"{_normalize_binary_label(x_values[i], chart_title)}: {_format_number_value(y_values[i], currency_symbol)}"
                for i in indices
            ]
        else:
            chart_title = chart_data.get('title', 'Untitled')
            data_points = [
                f"{_normalize_binary_label(x, chart_title)}: {_format_number_value(y, currency_symbol)}"
                for x, y in zip(x_values, y_values)
            ]
        data_str = "\n".join(data_points)
        
    elif chart_type == "pie":
        # Handle both labels/values and rows formats
        labels = chart_data.get("labels", [])
        values = chart_data.get("values", [])
        
        if not labels and "rows" in chart_data.get("data", {}):
            rows = chart_data["data"]["rows"]
            if rows:
                cols = list(rows[0].keys())
                l_col = cols[0]
                v_col = cols[1] if len(cols) > 1 else cols[0]
                labels = [r.get(l_col) for r in rows]
                values = [r.get(v_col) for r in rows]

        total = sum(values) if values else 1
        chart_title = chart_data.get('title', 'Untitled')
        data_points = [
            f"{_normalize_binary_label(l, chart_title)}: {_format_number_value(v, currency_symbol)} ({round(v/total*100, 1)}%)"
            for l, v in zip(labels[:10], values[:10])
        ]
        data_str = "\n".join(data_points)
        
    elif chart_type == "kpi":
        # Handle both direct value and data object formats
        value = chart_data.get("value")
        if value is None:
            value = chart_data.get("data", {}).get("value", 0)
            
        label = chart_data.get("label", chart_data.get("title", "Metric"))
        change = chart_data.get("change")
        data_str = f"{label}: {_format_number_value(value, currency_symbol)}"
        if change is not None:
            data_str += f" (change: {change:+.1f}%)"
            
    elif chart_type == "table":
        # Handle rows format
        data_obj = chart_data.get("data", {})
        rows = data_obj.get("rows", [])
        if rows:
            columns = list(rows[0].keys())
            data_str = f"Columns: {', '.join(columns)}\nFirst {len(rows[:5])} rows shown"
        else:
            data_str = "No data rows found."
        
    else:
        actual_data = chart_data.get("data", chart_data)
        data_str = str(actual_data)[:500]
    
    return f"""
User Question: {user_query}

Chart Type: {chart_type}
Chart Title: {chart_data.get('title', 'Untitled')}

Data:
{data_str}
"""

async def generate_chart_explanation(
    chart_type: str,
    chart_data: Dict[str, Any],
    user_query: str,
    currency_symbol: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate natural language explanation of chart using LLM.
    
    Args:
        chart_type: Type of chart (bar, line, pie, etc.)
        chart_data: Chart specification with data
        user_query: Original user question
        currency_symbol: Optional currency symbol (e.g. '$', '₹') to use in text
        
    Returns:
        {...}
    """
    client = get_llm_client()
    
    user_prompt = _build_chart_context(chart_type, chart_data, user_query, currency_symbol=currency_symbol)
    
    if currency_symbol:
        user_prompt += f"\n\nIMPORTANT: The currency symbol for this data is '{currency_symbol}'. Please use '{currency_symbol}' instead of '$' for all monetary values in your explanation."
    
    try:
        response = await client.complete(
            system_prompt=CHART_EXPLANATION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.3,  # Slightly creative
            max_tokens=512,
            purpose="dashboard_narrative",
        )
        
        logger.info(f"Chart explanation generated via {response.provider.value}")
        
        # Parse JSON response
        result = parse_json_response(response.content)
        
        return {
            "summary": result.get("summary", ""),
            "explanation": result.get("explanation", ""),
            "key_insight": result.get("key_insight", ""),
            "followup_questions": result.get("followup_questions", []),
        }
        
    except Exception as e:
        logger.warning(f"Failed to generate chart explanation: {e}")
        # Return fallback explanation
        return _generate_fallback_explanation(chart_type, chart_data, currency_symbol=currency_symbol)


def _generate_fallback_explanation(
    chart_type: str,
    chart_data: Dict[str, Any],
    currency_symbol: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate meaningful statistical explanation without LLM."""
    
    title = chart_data.get("title", "Data")
    summary = f"Chart showing {title}"
    explanation = "No clear pattern detected."
    key_insight = "Data is available for review."
    
    try:
        if chart_type == "bar":
            x = chart_data.get("x", [])
            y = chart_data.get("y", [])
            
            # Handle rows format
            if not x and "rows" in chart_data.get("data", {}):
                rows = chart_data["data"]["rows"]
                if rows and len(rows) > 0:
                    cols = list(rows[0].keys())
                    # Assuming 1st is dim, 2nd is metric
                    x_col = cols[0]
                    y_col = cols[1] if len(cols) > 1 else cols[0]
                    x = [r.get(x_col) for r in rows]
                    y = [r.get(y_col) for r in rows]

            if x and y:
                # Find max value
                max_val = max(y)
                max_idx = y.index(max_val)
                max_cat = _normalize_binary_label(x[max_idx], title)
                
                # Find min value
                min_val = min(y)
                min_idx = y.index(min_val)
                min_cat = _normalize_binary_label(x[min_idx], title)
                
                summary = f"Bar chart showing {title} breakdown."
                explanation = (
                    f"**{max_cat}** has the highest value "
                    f"({_format_number_value(max_val, currency_symbol)}), while **{min_cat}** is the lowest "
                    f"({_format_number_value(min_val, currency_symbol)})."
                )
                key_insight = f"{max_cat} dominates with {_format_number_value(max_val, currency_symbol)}."
            else:
                summary = f"Bar chart showing {title}"
                explanation = "A breakdown of values by category."
                key_insight = "Compare values across categories."
                
        elif chart_type == "line":
            x = chart_data.get("x", [])
            y = chart_data.get("y", [])
            
            # Handle series format
            if not x and "series" in chart_data.get("data", {}):
                series = chart_data["data"]["series"]
                if series and len(series) > 0:
                    cols = list(series[0].keys())
                    x_col = cols[0]
                    y_col = cols[1] if len(cols) > 1 else cols[0]
                    x = [s.get(x_col) for s in series]
                    y = [s.get(y_col) for s in series]

            if y and len(y) > 1:
                start = y[0]
                end = y[-1]
                trend = "increasing" if end > start else "decreasing"
                if start == end: trend = "stable"
                
                pct_change = ((end - start) / start) * 100 if start != 0 else 0
                
                summary = f"Line chart showing {title} over time."
                explanation = (
                    f"The trend is generally **{trend}**, starting at "
                    f"{_format_number_value(start, currency_symbol)} and ending at "
                    f"{_format_number_value(end, currency_symbol)} ({pct_change:+.1f}%)."
                )
                key_insight = f"Overall {trend} trend observed."
            else:
                summary = f"Line chart showing {title}"
                explanation = "Visualizing trends over time."
                key_insight = "Observe the changes over the period."
                
        elif chart_type == "pie":
            labels = chart_data.get("labels", [])
            values = chart_data.get("values", [])
            
            # Handle rows format
            if not labels and "rows" in chart_data.get("data", {}):
                rows = chart_data["data"]["rows"]
                if rows and len(rows) > 0:
                    cols = list(rows[0].keys())
                    l_col = cols[0]
                    v_col = cols[1] if len(cols) > 1 else cols[0]
                    labels = [r.get(l_col) for r in rows]
                    values = [r.get(v_col) for r in rows]

            if labels and values:
                total = sum(values) if sum(values) != 0 else 1
                max_val = max(values)
                max_idx = values.index(max_val)
                max_label = _normalize_binary_label(labels[max_idx], title)
                max_pct = (max_val / total) * 100
                
                summary = f"Pie chart showing {title} distribution."
                explanation = f"**{max_label}** accounts for the largest share at **{max_pct:.1f}%**."
                key_insight = f"{max_label} is the significant majority."
            else:
                summary = f"Pie chart showing {title}"
                explanation = "Showing proportion of each category."
                key_insight = "Compare segment sizes."
                
        elif chart_type == "kpi":
            value = chart_data.get("value")
            if value is None:
                value = chart_data.get("data", {}).get("value", 0)
                
            label = chart_data.get("label", chart_data.get("title", "Metric"))
            summary = f"KPI for {label}"
            explanation = f"The {label} is currently **{_format_number_value(value, currency_symbol)}**."
            key_insight = f"Current status: {_format_number_value(value, currency_symbol)}"
            
        else:
            explanation = "Visualizing data for analysis."
            key_insight = "Review the visual data."

    except Exception as e:
        logger.error(f"Fallback generation failed: {e}")
        explanation = "Detailed insights unavailable."
        
    return {
        "summary": summary,
        "explanation": explanation,
        "key_insight": key_insight,
        "followup_questions": [
            "What driven this trend?",
            "How does this compare to targets?",
            "Break this down further?"
        ],
    }
