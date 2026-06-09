import logging
import json
from typing import List, Dict, Any, Optional

from app.services.llm.llm_router import LLMRouter

logger = logging.getLogger(__name__)

SUGGESTION_PROMPT = """You are an expert BI data analyst assistant.
Based on the dataset schema, conversation history, and the latest analysis result, generate exactly 3-4 high-quality follow-up questions that the user can ask next.

Guidelines:
1. Questions MUST be data-aware and refer directly to column names, metrics, or dimensions present in the schema.
2. Questions should represent logical next steps (e.g. breakdown by dimension, trend over time, comparison, top-N, or correlation).
3. Do NOT suggest questions that have already been asked or answered in the conversation.
4. Keep the suggestions short, clear, and actionable (e.g. "What is the total sales by region?" or "Show churn rate trend over time").
5. Return ONLY a JSON array of strings. Do not include markdown code block formatting (like ```json).

Dataset schema:
{schema_text}

Conversation History:
{history_text}

Latest Result Context:
{latest_result_text}

Return ONLY a JSON list of strings, for example:
["Question 1", "Question 2", "Question 3"]"""

async def generate_contextual_suggestions(
    schema: dict,
    conversation_history: List[Dict[str, Any]],
    latest_result: Optional[Dict[str, Any]] = None,
    max_suggestions: int = 4,
) -> List[str]:
    """
    Generate context-aware and schema-aware analytics follow-up suggestions.
    """
    try:
        # Format schema details for the prompt
        schema_lines = []
        if "allowed_metrics" in schema and isinstance(schema["allowed_metrics"], dict):
            metrics = schema["allowed_metrics"].get("metrics", [])
            if metrics:
                schema_lines.append(f"- Metrics: {', '.join(metrics)}")
        if "allowed_dimensions" in schema and isinstance(schema["allowed_dimensions"], dict):
            dims = schema["allowed_dimensions"].get("dimensions", [])
            if dims:
                schema_lines.append(f"- Dimensions: {', '.join(dims)}")
            targets = schema["allowed_dimensions"].get("targets", [])
            if targets:
                schema_lines.append(f"- Binary Outcomes / Targets: {', '.join(targets)}")
        
        target_col = schema.get("target_column")
        if target_col:
            schema_lines.append(f"- Target Column: {target_col}")

        schema_text = "\n".join(schema_lines) if schema_lines else "No specific schema metadata available."

        # Format conversation history
        history_lines = []
        for msg in conversation_history[-5:]:  # Last 5 messages
            role = msg.get("role", "user").upper()
            content = msg.get("content", "")
            history_lines.append(f"{role}: {content}")
        history_text = "\n".join(history_lines) if history_lines else "No previous history."

        # Format latest result summary (extracting metadata, sql, chart title etc. to keep prompt token size clean)
        latest_text = "None"
        if latest_result:
            details = []
            if "type" in latest_result:
                details.append(f"Response Type: {latest_result['type']}")
            if "sql" in latest_result:
                details.append(f"SQL Query Executed: {latest_result['sql']}")
            if "chart" in latest_result and isinstance(latest_result["chart"], dict):
                chart_title = latest_result["chart"].get("title")
                chart_type = latest_result["chart"].get("type")
                if chart_title:
                    details.append(f"Chart Title: {chart_title}")
                if chart_type:
                    details.append(f"Chart Type: {chart_type}")
            latest_text = "\n".join(details) if details else str(latest_result)[:500]

        # Call LLM router
        router = LLMRouter()
        prompt = SUGGESTION_PROMPT.format(
            schema_text=schema_text,
            history_text=history_text,
            latest_result_text=latest_text
        )
        
        response_data = await router.generate_response(prompt, json_mode=True)
        
        # Handle different output formats from LLM router failsafes
        suggestions = []
        if isinstance(response_data, list):
            suggestions = [str(item) for item in response_data]
        elif isinstance(response_data, dict):
            # If wrapped as a dict like {"text": "..."} or {"suggestions": [...]}
            if "suggestions" in response_data and isinstance(response_data["suggestions"], list):
                suggestions = [str(item) for item in response_data["suggestions"]]
            elif "text" in response_data:
                try:
                    parsed = json.loads(response_data["text"])
                    if isinstance(parsed, list):
                        suggestions = [str(item) for item in parsed]
                except Exception:
                    # Try splitting by newline if it's text
                    suggestions = [s.strip() for s in response_data["text"].split("\n") if s.strip()]

        # Clean suggestions list and limit size
        cleaned_suggestions = []
        for s in suggestions:
            s_clean = s.strip().strip('"').strip("'").strip("-").strip("•").strip()
            if s_clean and len(s_clean) > 5:
                cleaned_suggestions.append(s_clean)

        return cleaned_suggestions[:max_suggestions]

    except Exception as e:
        logger.error(f"Error generating suggestions: {e}")
        # Fallback to schema-based generic suggestions
        fallback_suggestions = []
        if "allowed_metrics" in schema and isinstance(schema["allowed_metrics"], dict):
            metrics = schema["allowed_metrics"].get("metrics", [])
            if metrics:
                fallback_suggestions.append(f"What is the average {metrics[0]}?")
        if "allowed_dimensions" in schema and isinstance(schema["allowed_dimensions"], dict):
            dims = schema["allowed_dimensions"].get("dimensions", [])
            if dims and len(fallback_suggestions) > 0:
                fallback_suggestions.append(f"Break down by {dims[0]}")
        
        if not fallback_suggestions:
            fallback_suggestions = ["Show summary statistics", "Compare performance by region"]
            
        return fallback_suggestions[:max_suggestions]
