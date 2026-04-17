"""
Text answer generator module.

Belongs to: LLM services layer
Responsibility: Generate text-only answers for non-visualization queries
Restrictions: Returns formatted text responses without charts
"""

import asyncio
from typing import Any, Dict, List, Optional

import pandas as pd

from app.core.llm_client import get_llm_client
from app.core.logger import get_logger
from app.services.llm.intent_schema import AnalysisIntent, Aggregation
from app.services.llm.column_matcher import find_best_column_match, suggest_similar_columns

logger = get_logger(__name__)


TEXT_ANSWER_SYSTEM_PROMPT = """
You are a helpful data analytics assistant.

Rules:
1. Write a natural, conversational reply.
2. Use only the facts provided in the prompt.
3. Do not invent numbers, column names, or dataset details.
4. If the user is greeting you, answer warmly and briefly, then offer help with their data.
5. If the user asks a general analytics question, explain it in 2-3 short sentences.
6. If the user asked for a computed result, restate the exact result clearly and concisely.
7. Keep the response to 1-3 sentences unless the prompt explicitly asks for more.
8. Do not use bullet points, tables, or JSON.
"""


def _is_greeting_query(query: str) -> bool:
    query_lower = query.lower().strip()
    greeting_phrases = [
        "hello", "hi", "hey", "greetings", "good morning", "good afternoon", "good evening",
        "thanks", "thank you",
    ]
    return query_lower in greeting_phrases or (
        len(query_lower) <= 12 and any(phrase in query_lower for phrase in greeting_phrases)
    )


def _is_general_data_analytics_question(query: str, metric: Optional[str], group_by: Optional[List[str]]) -> bool:
    """Detect general knowledge questions that should not be forced into dataset summaries."""
    query_lower = query.lower().strip()
    if metric or group_by:
        return False

    general_data_phrases = [
        "what is data analytics",
        "what are data analytics",
        "what is analytics",
        "what is business intelligence",
        "what is bi",
        "define data analytics",
        "explain data analytics",
        "tell me about data analytics",
        "tell me about analytics",
    ]
    return any(phrase in query_lower for phrase in general_data_phrases) or (
        query_lower.startswith(("what is ", "define ", "explain ", "tell me about "))
        and any(term in query_lower for term in ("analytics", "analysis", "data", "business intelligence"))
    )


def _build_general_knowledge_context(query: str) -> str:
    """Build a prompt context for general knowledge questions."""
    return (
        "User asked a general analytics question that does not require dataset computation.\n"
        f"User query: {query}\n\n"
        "Write a concise, helpful explanation in 2-3 sentences. "
        "If the query is about data analytics, explain the concept in plain language and mention that you can also help with their dataset."
    )


def _format_column_name(column_name: str) -> str:
    """Convert column_name to friendly display name."""
    if not column_name:
        return ""
    # Replace underscores with spaces and title case
    return column_name.replace("_", " ").title()


def _resolve_metric(metric: Optional[str], columns: List[str]) -> Optional[str]:
    """Resolve metric name using fuzzy matching and semantic understanding."""
    if not metric:
        return None
    
    # Import semantic resolver
    from app.services.llm.semantic_column_resolver import resolve_metric_with_semantics
    
    # Try both fuzzy and semantic matching
    matched = resolve_metric_with_semantics(
        user_metric=metric,
        available_columns=columns,
        fuzzy_match_func=find_best_column_match,
    )
    
    if matched:
        if matched != metric:
            logger.info(f"Resolved metric: '{metric}' → '{matched}'")
        return matched
    
    return metric  # Return original if no match


async def generate_text_answer_async(
    df: pd.DataFrame,
    intent: AnalysisIntent,
    query: str,
    contract: Optional[Any] = None,  # AnalysisContract
) -> Dict[str, Any]:
    """
    Generate a text-only answer based on the intent.
    
    Args:
        df: DataFrame to analyze
        intent: Parsed user intent
        query: Original user query
        contract: Analysis contract for metric definitions
        
    Returns:
        {
            "answer": "Natural language answer",
            "value": computed_value,
            "column": "column_name",
            "aggregation": "aggregation_type",
            "methodology": ["step 1", "step 2"]
        }
    """
    # Resolve metric with fuzzy matching
    columns = list(df.columns)
    
    # Keep ORIGINAL metric name for user-facing responses  
    original_metric = intent.metric
    
    # Resolve to actual column name for computation
    metric = _resolve_metric(intent.metric, columns)
    aggregation = intent.aggregation
    group_by = intent.group_by
    
    # Also resolve group_by columns
    if group_by:
        group_by = [_resolve_metric(g, columns) or g for g in group_by]
    
    client = get_llm_client()

    async def _compose_llm_reply(context_text: str, fallback_answer: str) -> str:
        try:
            response = await client.complete(
                system_prompt=TEXT_ANSWER_SYSTEM_PROMPT,
                user_prompt=context_text,
                temperature=0.25,
                max_tokens=220,
                purpose="chat",
            )
            content = (response.content or "").strip()
            return content or fallback_answer
        except Exception as exc:
            logger.warning(f"LLM text reply generation failed, using fallback: {exc}")
            return fallback_answer

    # Handle chat/greetings
    if _is_greeting_query(query):
        answer = await _compose_llm_reply(
            context_text=(
                "User message is a greeting.\n"
                f"User query: {query}\n\n"
                "Reply with a warm, short greeting and offer help with their data."
            ),
            fallback_answer="Hello! How can I help you with your data?",
        )
        return {
            "answer": answer,
            "value": None,
            "column": None,
            "aggregation": None,
            "methodology": []
        }

    if _is_general_data_analytics_question(query, metric=metric, group_by=group_by):
        answer = await _compose_llm_reply(
            context_text=_build_general_knowledge_context(query),
            fallback_answer=(
                "Data analytics is the process of examining data to find patterns and useful insights. "
                "It helps teams make better decisions by turning raw numbers into information they can act on. "
                "If you want, I can also show how that applies to your dataset."
            ),
        )
        return {
            "answer": answer,
            "value": None,
            "column": None,
            "aggregation": None,
            "methodology": [],
        }
    
    try:
        methodology_steps = []
        
        # 1. Verify metric in contract if provided
        if contract and contract.allowed_metrics and metric:
            # Check if metric is allowed/defined
            metrics_dict = contract.allowed_metrics.get("metrics", {})
            
            # Handle list format (legacy)
            if isinstance(metrics_dict, list):
                if metric not in metrics_dict:
                     logger.warning(f"Metric '{metric}' not found in contract")
            # Handle dict format (new MetricDefinition)
            elif isinstance(metrics_dict, dict):
                 meta = metrics_dict.get(metric)
                 if meta:
                     # If it's a dict (MetricDefinition), exposing formula
                     if isinstance(meta, dict) and meta.get("expression"):
                         methodology_steps.append(f"Calculated '{meta.get('name', metric)}' = {meta.get('expression')}")

        # Compute the value based on aggregation
        if aggregation == Aggregation.COUNT:
            if group_by:
                result = df.groupby(group_by).size()
                value = len(result)
                answer = _format_count_grouped(result, group_by)
                methodology_steps.append(f"Grouped by {', '.join(group_by)} and counted records")
            else:
                value = len(df)
                answer = f"There are **{value:,}** total records in the dataset."
                methodology_steps.append("Counted total records in dataset")
                
        elif aggregation == Aggregation.SUM:
            if metric and metric in df.columns:
                # Use ORIGINAL metric name for display, not resolved column
                friendly_name = _format_column_name(original_metric) if original_metric else _format_column_name(metric)
                if group_by:
                    result = df.groupby(group_by)[metric].sum()
                    value = result.sum()
                    answer = _format_sum_grouped(result, metric, group_by)
                    methodology_steps.append(f"Grouped by {', '.join(group_by)} and summed '{metric}'")
                else:
                    if pd.api.types.is_numeric_dtype(df[metric]):
                        value = df[metric].sum()
                        answer = f"The total **{friendly_name}** is **{_format_number(value)}**."
                        methodology_steps.append(f"Summed values in '{metric}' column")
                    else:
                        # For categorical columns, "Total" usually implies a breakdown or specific count
                        if df[metric].nunique() < 10:
                            counts = df[metric].value_counts()
                            breakdown = ", ".join([f"**{k}**: {_format_number(v)}" for k, v in counts.items()])
                            value = len(df)
                            answer = f"Total **{friendly_name}** breakdown: {breakdown}"
                            methodology_steps.append(f"Counted unique values for '{metric}'")
                        else:
                            # Fallback to count for high cardinality
                            value = len(df)
                            answer = f"There are **{value:,}** total **{friendly_name}** entries."
                            methodology_steps.append(f"Counted total records for '{metric}'")
            else:
                return _error_response(f"Column '{metric}' not found")
                
        elif aggregation == Aggregation.AVG:
            if metric and metric in df.columns:
                friendly_name = _format_column_name(original_metric) if original_metric else _format_column_name(metric)
                if group_by:
                    result = df.groupby(group_by)[metric].mean()
                    value = result.mean()
                    answer = _format_avg_grouped(result, metric, group_by)
                    methodology_steps.append(f"Grouped by {', '.join(group_by)} and averaged '{metric}'")
                else:
                    value = df[metric].mean()
                    answer = f"The average **{friendly_name}** is **{_format_number(value)}**."
                    methodology_steps.append(f"Calculated average of '{metric}'")
            else:
                return _error_response(f"Column '{metric}' not found")
                
        elif aggregation == Aggregation.MIN:
            if metric and metric in df.columns:
                friendly_name = _format_column_name(original_metric) if original_metric else _format_column_name(metric)
                value = df[metric].min()
                answer = f"The minimum **{friendly_name}** is **{_format_number(value)}**."
                methodology_steps.append(f"Found minimum value in '{metric}'")
            else:
                return _error_response(f"Column '{metric}' not found")
                
        elif aggregation == Aggregation.MAX:
            if metric and metric in df.columns:
                friendly_name = _format_column_name(original_metric) if original_metric else _format_column_name(metric)
                value = df[metric].max()
                answer = f"The maximum **{friendly_name}** is **{_format_number(value)}**."
                methodology_steps.append(f"Found maximum value in '{metric}'")
            else:
                return _error_response(f"Column '{metric}' not found")
                
        else:
            # Default: describe the dataset
            return _generate_data_summary(df, query)
        
        answer = await _compose_llm_reply(
            context_text=(
                f"User query: {query}\n"
                f"Exact answer from computation: {answer}\n"
                f"Column: {metric or 'none'}\n"
                f"Aggregation: {aggregation.value if aggregation else 'none'}\n"
                f"Methodology: {'; '.join(methodology_steps) if methodology_steps else 'none'}\n\n"
                "Turn this into a concise, natural reply. Keep the computed facts unchanged."
            ),
            fallback_answer=answer,
        )

        return {
            "answer": answer,
            "value": value,
            "column": metric,
            "aggregation": aggregation.value,
            "methodology": methodology_steps
        }
        
    except Exception as e:
        logger.error(f"Error generating text answer: {e}")
        return _error_response(str(e))


def generate_text_answer(
    df: pd.DataFrame,
    intent: AnalysisIntent,
    query: str,
    contract: Optional[Any] = None,  # AnalysisContract
) -> Dict[str, Any]:
    """Synchronous compatibility wrapper for legacy callers."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(generate_text_answer_async(df=df, intent=intent, query=query, contract=contract))

    raise RuntimeError(
        "generate_text_answer() cannot be called from an active event loop; "
        "await generate_text_answer_async() instead."
    )


def _format_number(value: float) -> str:
    """Format a number for display."""
    if pd.isna(value):
        return "N/A"
    
    if isinstance(value, (int, float)):
        if isinstance(value, float):
            if value >= 1_000_000:
                return f"{value / 1_000_000:.2f}M"
            elif value >= 1_000:
                return f"{value / 1_000:.2f}K"
            elif value == int(value):
                return f"{int(value):,}"
            else:
                return f"{value:,.2f}"
        return f"{value:,}"
    
    return str(value)


def _format_count_grouped(result: pd.Series, group_by: list) -> str:
    """Format grouped count result."""
    group_col = group_by[0] if group_by else "group"
    top_items = result.nlargest(3)
    
    lines = [f"Here's the count breakdown by **{group_col}**:\n"]
    for name, count in top_items.items():
        lines.append(f"- **{name}**: {count:,}")
    
    if len(result) > 3:
        lines.append(f"\n*...and {len(result) - 3} more categories.*")
    
    return "\n".join(lines)


def _format_sum_grouped(result: pd.Series, metric: str, group_by: list) -> str:
    """Format grouped sum result."""
    group_col = group_by[0] if group_by else "group"
    friendly_metric = _format_column_name(metric)
    friendly_group = _format_column_name(group_col)
    top_items = result.nlargest(3)
    
    lines = [f"Here's the **{friendly_metric}** total by **{friendly_group}**:\n"]
    for name, value in top_items.items():
        lines.append(f"- **{name}**: {_format_number(value)}")
    
    total = result.sum()
    lines.append(f"\n**Total across all**: {_format_number(total)}")
    
    return "\n".join(lines)


def _format_avg_grouped(result: pd.Series, metric: str, group_by: list) -> str:
    """Format grouped average result."""
    group_col = group_by[0] if group_by else "group"
    friendly_metric = _format_column_name(metric)
    friendly_group = _format_column_name(group_col)
    
    lines = [f"Here's the average **{friendly_metric}** by **{friendly_group}**:\n"]
    for name, value in result.items():
        lines.append(f"- **{name}**: {_format_number(value)}")
    
    overall_avg = result.mean()
    lines.append(f"\n**Overall average**: {_format_number(overall_avg)}")
    
    return "\n".join(lines)


def _generate_data_summary(df: pd.DataFrame, query: str) -> Dict[str, Any]:
    """Generate a general data summary when no specific aggregation."""
    row_count = len(df)
    col_count = len(df.columns)
    
    # Get numeric columns for summary
    numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
    
    summary_lines = [
        f"Your dataset contains **{row_count:,}** rows and **{col_count}** columns.",
    ]
    
    if numeric_cols:
        numeric_summaries = []
        for col in numeric_cols[:3]:  # Keep the response short and readable.
            friendly_col = _format_column_name(col)
            total = df[col].sum()
            avg = df[col].mean()
            numeric_summaries.append(f"{friendly_col} totals {_format_number(total)} with an average of {_format_number(avg)}")
        summary_lines.append("Key numeric columns include " + "; ".join(numeric_summaries) + ".")
    
    # Add null info
    null_counts = df.isnull().sum()
    cols_with_nulls = null_counts[null_counts > 0]
    if len(cols_with_nulls) > 0:
        summary_lines.append(f"{len(cols_with_nulls)} columns have missing values that may need cleanup.")
    else:
        summary_lines.append("No missing values were detected in the columns I checked.")
    
    return {
        "answer": " ".join(summary_lines),
        "value": None,
        "column": None,
        "aggregation": "summary",
        "methodology": ["Analyzed dataset structure"]
    }


def _error_response(message: str) -> Dict[str, Any]:
    """Generate error response."""
    return {
        "answer": f"I couldn't compute that: {message}",
        "value": None,
        "column": None,
        "aggregation": None,
        "methodology": [],
        "error": True,
    }
