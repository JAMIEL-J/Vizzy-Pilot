"""
Role Taxonomy — Single Source of Truth for Semantic Column Roles.

Extracted from semantic_audit.py to break a circular import chain:
  semantic_audit → analytics.query_utils → analytics.__init__ → chart_recommender → semantic_audit

This module has ZERO dependencies on other app modules.
"""

from typing import Any, Dict


# ROLE_TAXONOMY (locked)
ROLE_TAXONOMY: Dict[str, Dict[str, Any]] = {
    # Temporal
    "date": {"affinity": "time_series_x", "execution_slot": "duckdb"},
    "datetime": {"affinity": "time_series_x", "execution_slot": "duckdb"},
    "year_month": {"affinity": "time_series_x", "execution_slot": "duckdb"},
    "fiscal_period": {"affinity": "time_series_x", "execution_slot": "duckdb"},
    # Dimension
    "category": {"affinity": "groupby_x", "execution_slot": "duckdb"},
    "sub_category": {"affinity": "groupby_x", "execution_slot": "duckdb"},
    "geography": {"affinity": "map_dimension", "execution_slot": "duckdb"},
    "entity_id": {"affinity": "filter_only", "execution_slot": "duckdb"},
    "boolean_flag": {"affinity": "filter_only", "execution_slot": "duckdb"},
    # Measure
    "revenue": {"affinity": "measure_y", "execution_slot": "duckdb"},
    "cost": {"affinity": "measure_y", "execution_slot": "duckdb"},
    "quantity": {"affinity": "measure_y", "execution_slot": "duckdb"},
    "count": {"affinity": "measure_y", "execution_slot": "duckdb"},
    "score": {"affinity": "measure_y", "execution_slot": "duckdb"},
    "duration_seconds": {"affinity": "measure_y", "execution_slot": "duckdb"},
    "ratio_pct": {"affinity": "gauge_measure", "execution_slot": "pandas"},
    # Identity (no chart output)
    "primary_key": {"affinity": "identifier", "execution_slot": None},
    "foreign_key": {"affinity": "identifier", "execution_slot": None},
    "name_label": {"affinity": "label", "execution_slot": None},
    "profit": {"affinity": "measure_y", "execution_slot": "duckdb"},
    "target": {"affinity": "filter_only", "execution_slot": "duckdb"},
    "tenure": {"affinity": "measure_y", "execution_slot": "duckdb"},
    # Fallback
    "unclassified": {"affinity": "none", "execution_slot": None},
}


# LLM-friendly descriptions derived from ROLE_TAXONOMY — used by SemanticMapper prompt
ROLE_VOCABULARY_FOR_LLM: Dict[str, str] = {
    "date": "Date, timestamp, or temporal period (transaction date, event date)",
    "datetime": "Date + time combined values (created_at, login_time)",
    "year_month": "Monthly period or year-month strings (2024-01, Jan 2024)",
    "fiscal_period": "Fiscal quarter/period labels (Q1 2024, FY23)",
    "category": "Dimension for grouping — product line, segment, department",
    "sub_category": "More granular category level (product sub-type)",
    "geography": "Geographic dimension — country, state, city, territory, region, market",
    "entity_id": "Entity identifier used for filtering (customer ID, order ID)",
    "boolean_flag": "True/False, Yes/No, or binary 0/1 indicator",
    "target": "Goal metric or outcome — churn status, conversion flag, success/fail label",
    "revenue": "Financial gain — total sales, amount, turnover, income",
    "cost": "Expenses — spending, COGS, outflow",
    "profit": "Net profit, margin, earnings after costs",
    "quantity": "Volume — units sold, count of items, order quantity",
    "count": "Aggregated counts or totals",
    "ratio_pct": "Derived percentage or ratio metric (margin %, conversion rate)",
    "score": "Scores, ratings, or index values",
    "duration_seconds": "Time duration in seconds or milliseconds",
    "primary_key": "Unique row identifier — UUID, auto-increment ID",
    "foreign_key": "Reference to another entity (customer_id on an orders table)",
    "name_label": "Human-readable label or name (customer name, product name)",
    "tenure": "Numeric time-duration NOT suitable for time-series X axis — tenure months, years of service, age, experience years. This is a MEASURE, not a temporal axis.",
    "unclassified": "No clear semantic role fits the data",
}


__all__ = [
    "ROLE_TAXONOMY",
    "ROLE_VOCABULARY_FOR_LLM",
]
