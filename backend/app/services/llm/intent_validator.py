from typing import List, Optional
from app.core.exceptions import InvalidOperation
from app.core.logger import get_logger
from app.models.analysis_contract import AnalysisContract
from app.services.llm.intent_schema import AnalysisIntent, Aggregation
from app.services.llm.column_matcher import (
    find_best_column_match,
    suggest_similar_columns,
)


logger = get_logger(__name__)


def validate_intent(
    *,
    intent: AnalysisIntent,
    contract: AnalysisContract,
    available_columns: List[str],
    time_columns: List[str],
) -> AnalysisIntent:
    """
    Validate an AnalysisIntent against an AnalysisContract and dataset schema.
    
    Uses fuzzy column matching to resolve column names.
    Raises InvalidOperation on any validation failure.
    
    Returns:
        The intent with corrected/resolved column names
    """
    
    _validate_intent_type(intent)
    _validate_aggregation(intent, contract)
    
    # Auto-correct common LLM hallucinated swaps (e.g. YoY revenue -> group_by: revenue, metric: year)
    if intent.metric and intent.group_by and len(intent.group_by) > 0:
        metric_lower = intent.metric.lower()
        group_lower = intent.group_by[0].lower()
        time_kws = ["year", "month", "day", "date", "quarter", "week"]
        fin_kws = ["revenue", "profit", "income", "cost", "sales", "price", "amount", "budget", "count", "total",
                   "los", "mortality", "readmission", "rate", "score", "charge", "billing", "admissions"]
        if any(kw in metric_lower for kw in time_kws) and any(kw in group_lower for kw in fin_kws):
            logger.info(f"Auto-correcting swapped metric/group_by: metric={intent.metric}, group_by={intent.group_by[0]}")
            intent.metric, intent.group_by[0] = intent.group_by[0], intent.metric
            
    # Resolve and validate columns with fuzzy matching
    intent = _resolve_and_validate_metric(intent, contract, available_columns)
    intent = _resolve_and_validate_group_by(intent, contract, available_columns)
    intent = _resolve_and_validate_time(intent, contract, time_columns)
    
    return intent


def _validate_intent_type(intent: AnalysisIntent) -> None:
    # Allow both analysis and visualization intent types
    valid_types = ["analysis", "visualization"]
    if intent.intent_type.value not in valid_types:
        logger.info(f"Skipping intent type validation for: {intent.intent_type.value}")


def _validate_aggregation(
    intent: AnalysisIntent,
    contract: AnalysisContract,
) -> None:
    if intent.aggregation not in Aggregation:
        raise InvalidOperation(
            operation="validate_intent",
            reason=f"Invalid aggregation: {intent.aggregation}",
        )

    if contract.constraints:
        blocked = contract.constraints.get("blocked_operations", [])
        if intent.aggregation.value in blocked:
            raise InvalidOperation(
                operation="validate_intent",
                reason=f"Aggregation '{intent.aggregation.value}' is blocked by contract",
            )


def _resolve_and_validate_metric(
    intent: AnalysisIntent,
    contract: AnalysisContract,
    available_columns: List[str],
) -> AnalysisIntent:
    """Resolve metric column with fuzzy matching and semantic understanding."""
    
    if intent.aggregation != Aggregation.COUNT:
        if not intent.metric:
            raise InvalidOperation(
                operation="validate_intent",
                reason="Metric is required for this aggregation",
            )

    if intent.metric:
        # Import semantic resolver
        from app.services.llm.semantic_column_resolver import (
            resolve_metric_with_semantics,
            get_business_term_suggestions,
        )
        
        # Try both fuzzy and semantic matching
        matched_column = resolve_metric_with_semantics(
            user_metric=intent.metric,
            available_columns=available_columns,
            fuzzy_match_func=find_best_column_match,
        )
        
        if matched_column:
            if matched_column != intent.metric:
                logger.info(f"Resolved metric: '{intent.metric}' → '{matched_column}'")
            intent.metric = matched_column
        else:
            # Provide helpful suggestions using semantic understanding
            semantic_suggestions = get_business_term_suggestions(intent.metric, available_columns)
            
            if semantic_suggestions:
                suggestion_text = f" Based on your query for '{intent.metric}', did you mean: {', '.join([f'{s}' for s in semantic_suggestions[:3]])}?"
            else:
                # Fall back to fuzzy suggestions
                fuzzy_suggestions = suggest_similar_columns(intent.metric, available_columns)
                if fuzzy_suggestions:
                    suggestion_text = f" Similar columns: {', '.join([f'{s[0]}' for s in fuzzy_suggestions[:3]])}"
                else:
                    suggestion_text = f" Available metrics: {', '.join(available_columns[:5])}"
            
            raise InvalidOperation(
                operation="validate_intent",
                reason=f"Column '{intent.metric}' not found in dataset.{suggestion_text}",
            )

        # Check contract allowance (using resolved column)
        # For COUNT, target columns (like Churn) are always valid — they are being counted, not aggregated numerically
        allowed_list = contract.allowed_metrics.get("metrics", []) if contract.allowed_metrics else []
        allowed_targets = contract.allowed_dimensions.get("targets", []) if contract.allowed_dimensions else []
        is_count = intent.aggregation == Aggregation.COUNT
        if allowed_list and intent.metric not in allowed_list:
            if not (is_count and (intent.metric in allowed_targets or intent.metric in available_columns)):
                raise InvalidOperation(
                    operation="validate_intent",
                    reason=f"Metric '{intent.metric}' is not allowed by contract",
                )
    
    return intent


def _resolve_and_validate_group_by(
    intent: AnalysisIntent,
    contract: AnalysisContract,
    available_columns: List[str],
) -> AnalysisIntent:
    """Resolve group_by columns with fuzzy matching."""
    
    if not intent.group_by:
        return intent

    resolved_columns = []
    
    for column in intent.group_by:
        # Try fuzzy matching
        matched_column = find_best_column_match(column, available_columns)
        
        if matched_column:
            if matched_column != column:
                logger.info(f"Fuzzy matched group_by: '{column}' → '{matched_column}'")
            resolved_columns.append(matched_column)
        else:
            # Provide helpful suggestions
            suggestions = suggest_similar_columns(column, available_columns)
            suggestion_text = ""
            if suggestions:
                top_suggestions = [f"'{s[0]}'" for s in suggestions[:3]]
                suggestion_text = f" Did you mean: {', '.join(top_suggestions)}?"
            
            raise InvalidOperation(
                operation="validate_intent",
                reason=f"Column '{column}' not found in dataset.{suggestion_text}",
            )

        # Check contract allowance (using resolved column)
        # Also allow target columns (e.g. Churn) and any actual df column for group_by
        allowed_list = contract.allowed_dimensions.get("dimensions", []) if contract.allowed_dimensions else []
        allowed_targets = contract.allowed_dimensions.get("targets", []) if contract.allowed_dimensions else []
        if allowed_list and matched_column not in allowed_list:
            # Allow if it's a known target column (binary outcome like Churn, Status)
            if matched_column not in allowed_targets and matched_column not in available_columns:
                raise InvalidOperation(
                    operation="validate_intent",
                    reason=f"Dimension '{matched_column}' is not allowed by contract",
                )
    
    intent.group_by = resolved_columns
    return intent


def _resolve_and_validate_time(
    intent: AnalysisIntent,
    contract: AnalysisContract,
    time_columns: List[str],
) -> AnalysisIntent:
    """Resolve time column with fuzzy matching."""
    
    if not intent.time_column and not intent.time_granularity:
        return intent

    if not intent.time_column or not intent.time_granularity:
        raise InvalidOperation(
            operation="validate_intent",
            reason="Both time_column and time_granularity are required for time analysis",
        )

    # Try fuzzy matching for time column
    matched_column = find_best_column_match(intent.time_column, time_columns)
    
    if matched_column:
        if matched_column != intent.time_column:
            logger.info(f"Fuzzy matched time_column: '{intent.time_column}' → '{matched_column}'")
        intent.time_column = matched_column
    else:
        raise InvalidOperation(
            operation="validate_intent",
            reason=f"Time column '{intent.time_column}' is not valid. Available: {time_columns}",
        )

    if contract.time_granularity and intent.time_granularity != contract.time_granularity:
        raise InvalidOperation(
            operation="validate_intent",
            reason="Time granularity does not match contract",
        )
    
    return intent
