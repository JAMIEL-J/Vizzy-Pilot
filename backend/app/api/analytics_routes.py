"""
Analytics API routes.

Belongs to: API layer
Responsibility: Provide real-time analytics and statistics for user dashboards
Restrictions: Returns computed metrics from actual dataset data

Version: 3.0 - Dynamic Analytics Engine with Domain Detection
"""

# pyright: reportGeneralTypeIssues=false

from typing import Dict, Any, Optional, List, Tuple
from uuid import UUID
from datetime import datetime, timezone
import json
import logging
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.deps import DBSession, AuthenticatedUser
from app.core.logger import get_logger
from app.core.exceptions import AuthorizationError
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.analysis_contract import AnalysisContract
from app.models.analysis_result import AnalysisResult
from app.models.user import UserRole as ModelUserRole
from app.services.dataset_version_service import get_latest_version
from app.services.analysis_contract_service import create_analysis_contract
from app.services.analysis_service import create_analysis_result
from app.services.analytics import (
    detect_domain,
    get_domain_confidence,
    filter_columns,
    generate_kpis,
    recommend_charts,
    DomainType
)
from app.services.analytics.csv_loader import safe_read_csv
from app.services.analytics.pivot_generator import generate_pivot_config, generate_pivot_data
from app.services.analytics.duckdb_builder import get_or_build_duckdb
from app.services.analytics.duckdb_chart_builder import execute_chart_queries, execute_kpi_queries
from sqlmodel import select
import pandas as pd
import numpy as np
import duckdb



router = APIRouter()
logger = get_logger(__name__)


# =============================================================================
# Response Schemas
# =============================================================================


class DashboardAnalyticsResponse(BaseModel):
    """Response containing dashboard analytics data."""
    dataset_name: str
    total_rows: int
    domain: str
    domain_confidence: str
    kpis: Dict[str, Any]
    charts: Dict[str, Any]
    columns: Dict[str, List[str]]
    target_column: Optional[str] = None
    target_values: List[str] = []
    geo_filters: Dict[str, List[str]] = {}
    raw_data: List[Dict[str, Any]] = []
    chart_configs: Dict[str, Any] = {}
    data_quality: List[Dict[str, Any]] = []


class DashboardStateRequest(BaseModel):
    """Request payload containing the full dashboard state from Zustand."""
    dataset_id: UUID
    target_value: Optional[str] = None
    active_filters: Dict[str, List[str]] = {}
    chart_overrides: Dict[str, Any] = {}
    classification_overrides: Dict[str, str] = {}
    selected_domain: Optional[str] = None


# =============================================================================
# Helper Functions
# =============================================================================


def _find_target_column(df: pd.DataFrame) -> Optional[str]:
    """Find the most likely target column."""
    target_keywords = ['churn', 'outcome', 'status', 'default', 'converted', 'target', 'label']
    categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
    
    for col in categorical_cols:
        col_lower = col.lower()
        if any(kw in col_lower for kw in target_keywords):
            if df[col].nunique() <= 5:
                return col
    
    # Fallback: any binary categorical
    for col in categorical_cols:
        if df[col].nunique() == 2:
            return col
    
    return None


def _normalize_binary_target_values(target_col: str, values: List[str]) -> List[str]:
    """Return semantically normalized binary target values when possible.

    This keeps frontend target tabs aligned with chart labels.
    """
    if not target_col or not values:
        return values

    normalized_col = str(target_col).lower().replace('_', '').replace('-', '')
    normalized_vals = [str(v).strip().lower() for v in values]
    unique_vals = sorted(set(normalized_vals))

    binary_like = set(unique_vals).issubset({
        '0', '1', '0.0', '1.0', 'yes', 'no', 'true', 'false',
        'churned', 'retained', 'exited', 'stayed', 'attrited', 'left', 'active', 'inactive'
    }) and len(unique_vals) <= 2

    if not binary_like:
        return values

    if 'exit' in normalized_col:
        return ['Exited', 'Stayed']
    if 'churn' in normalized_col:
        return ['Churned', 'Retained']
    if 'attrition' in normalized_col:
        return ['Attrited', 'Retained']
    if 'left' in normalized_col or 'leave' in normalized_col:
        return ['Left', 'Stayed']
    if 'cancel' in normalized_col:
        return ['Cancelled', 'Active']

    return values


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


def _is_currency_label(text: str) -> bool:
    label = (text or "").lower()
    keywords = [
        "revenue", "profit", "income", "earnings", "cost", "expense",
        "price", "charges", "payment", "budget", "salary", "wage",
        "fee", "sales", "discount", "amount", "value",
    ]
    return any(kw in label for kw in keywords)


def _format_narrative_value(value: Any, is_currency: bool = False, currency_symbol: str = "$") -> str:
    if not isinstance(value, (int, float, np.integer, np.floating)):
        return str(value)

    num = float(value)
    abs_num = abs(num)
    sign = "-" if num < 0 else ""

    if abs_num >= 1_000_000_000:
        base = f"{sign}{abs_num / 1_000_000_000:.2f}".rstrip("0").rstrip(".") + "B"
    elif abs_num >= 1_000_000:
        base = f"{sign}{abs_num / 1_000_000:.2f}".rstrip("0").rstrip(".") + "M"
    elif abs_num >= 1_000:
        base = f"{sign}{abs_num / 1_000:.2f}".rstrip("0").rstrip(".") + "K"
    else:
        if num.is_integer():
            base = f"{int(num):,}"
        else:
            base = f"{num:,.2f}".rstrip("0").rstrip(".")

    return f"{currency_symbol}{base}" if is_currency else base


def _normalize_filter_value(value: Any) -> str:
    """
    Normalize a value for filter matching.
    Handles case-insensitivity, type coercion, and whitespace trimming.
    """
    if value is None or value == '':
        return ''
    return str(value).strip().lower()


def _scalar_filter_match(row_value: Any, filter_value: Any) -> bool:
    """
    Check if a row value matches a filter value with smart normalization.
    
    Handles:
    - Case-insensitive string matching:  "NORTH" == "north"
    - Type coercion: 1 == "1" == 1.0 == True
    - Whitespace trimming: "  North  " == "North"
    - None/NULL values: None != any filter value
    """
    # Exact type match first (fast path)
    if row_value == filter_value:
        return True
    
    # None/NULL handling
    if row_value is None or filter_value is None:
        return False
    
    # Normalize both to lowercase strings for comparison
    row_norm = _normalize_filter_value(row_value)
    filter_norm = _normalize_filter_value(filter_value)
    
    # String comparison
    if row_norm == filter_norm:
        return True
    
    # Try numeric comparison for when types differ
    try:
        row_num = float(row_norm)
        filter_num = float(filter_norm)
        if not (pd.isna(row_num) or pd.isna(filter_num)):
            return row_num == filter_num
    except (ValueError, TypeError):
        pass
    
    return False


def _binary_target_value_match(row_value: Any, filter_value: Any) -> bool:
    """
    Special matching for binary target values (Churn, Yes/No, True/False, 1/0).
    Treats semantically equivalent values as matches.
    """
    POSITIVE_KEYWORDS = {'1', '1.0', 'yes', 'true', 'y', 'positive', 'churned', 'churn', 
                        'exited', 'attrited', 'left', 'cancelled', 'canceled', 'defaulted', 'inactive'}
    NEGATIVE_KEYWORDS = {'0', '0.0', 'no', 'false', 'n', 'negative', 'retained', 'stayed', 
                        'active', 'performing'}
    
    row_norm = _normalize_filter_value(row_value)
    filter_norm = _normalize_filter_value(filter_value)
    
    # If both are positive or both are negative, they match
    if row_norm in POSITIVE_KEYWORDS and filter_norm in POSITIVE_KEYWORDS:
        return True
    if row_norm in NEGATIVE_KEYWORDS and filter_norm in NEGATIVE_KEYWORDS:
        return True
    
    return False


def _is_filtered_dashboard_request(state: "DashboardStateRequest") -> bool:
    """Return True when dashboard request has any active filter scope."""
    has_target_filter = bool(state.target_value and str(state.target_value).lower() != "all")
    has_active_filters = any(bool(v) for v in (state.active_filters or {}).values())
    return has_target_filter or has_active_filters


def _build_duckdb_chart_configs(
    charts_full: Dict[str, Dict[str, Any]],
    date_columns: List[str],
    target_col: Optional[str],
) -> Tuple[Dict[str, Dict[str, Any]], List[Dict[str, str]]]:
    """Convert recommended chart metadata into duckdb_chart_builder configs."""
    chart_configs: Dict[str, Dict[str, Any]] = {}
    unsupported_slots: List[Dict[str, str]] = []

    # DuckDB path currently supports generic grouped aggregations.
    # Keep pandas for semantic/specialized visuals (cohort/range/stacked/target-binary).
    unsupported_types = {
        "scatter",
        "stacked_bar",
        "geo_map",
        "area_bounds",
        "area-bounds",
        "heatmap",
        "treemap",
    }

    for slot, chart in charts_full.items():
        dim = chart.get("dimension")
        metric = chart.get("metric")
        chart_type = str(chart.get("type", "bar")).lower()
        title = str(chart.get("title") or "").lower()

        if chart_type in unsupported_types:
            unsupported_slots.append({
                "slot": slot,
                "title": str(chart.get("title") or ""),
                "reason": f"unsupported_type:{chart_type}",
            })
            continue

        if "cohort" in title or "range" in title or "at risk" in title:
            unsupported_slots.append({
                "slot": slot,
                "title": str(chart.get("title") or ""),
                "reason": "unsupported_semantic_title",
            })
            continue

        if target_col and (
            (dim and str(dim).lower() == str(target_col).lower())
            or (metric and str(metric).lower() == str(target_col).lower())
        ):
            unsupported_slots.append({
                "slot": slot,
                "title": str(chart.get("title") or ""),
                "reason": "target_semantics_chart",
            })
            continue

        # Skip configs that cannot produce meaningful SQL aggregation.
        if not dim and not metric:
            unsupported_slots.append({
                "slot": slot,
                "title": str(chart.get("title") or ""),
                "reason": "missing_dimension_and_metric",
            })
            continue

        # Keep complex time intelligence in pandas, but allow standard date trends in DuckDB.
        if dim and dim in date_columns:
            granularity = str(chart.get("granularity") or "").lower()
            is_simple_date_trend = chart_type in {"line", "area"} and granularity not in {"year", "ytd"}
            if not is_simple_date_trend:
                unsupported_slots.append({
                    "slot": slot,
                    "title": str(chart.get("title") or ""),
                    "reason": "complex_time_series_delegated_to_pandas",
                })
                continue

        chart_configs[slot] = {
            "type": chart.get("type", "bar"),
            "dimension": dim,
            "metric": metric,
            "aggregation": chart.get("aggregation", "sum"),
            "granularity": chart.get("granularity"),
            "is_date": bool(dim and dim in date_columns),
            "x_column": chart.get("x_column"),
            "y_column": chart.get("y_column"),
        }

    return chart_configs, unsupported_slots


def _try_duckdb_analytics(
    *,
    state: "DashboardStateRequest",
    dataset_id: UUID,
    version_id: UUID,
    csv_path: str,
    charts_full: Dict[str, Dict[str, Any]],
    date_columns: List[str],
    target_col: Optional[str],
) -> Dict[str, Any]:
    """Attempt filtered chart recompute via DuckDB; return success flag and merged charts."""
    if not _is_filtered_dashboard_request(state):
        return {"success": False, "reason": "not_filtered"}

    chart_configs, unsupported_slots = _build_duckdb_chart_configs(charts_full, date_columns, target_col)
    if not chart_configs:
        logger.info(
            "[DUCKDB SKIP] reason=no_chart_configs total_slots=%s unsupported_slots=%s",
            len(charts_full),
            unsupported_slots,
        )
        return {"success": False, "reason": "no_chart_configs"}

    if len(chart_configs) != len(charts_full):
        logger.info(
            "[DUCKDB HYBRID] duckdb_slots=%s pandas_slots=%s unsupported_slots=%s",
            len(chart_configs),
            len(charts_full) - len(chart_configs),
            unsupported_slots,
        )

    conn = None
    try:
        bootstrap_started = datetime.now(timezone.utc)
        duckdb_path = get_or_build_duckdb(dataset_id, version_id, csv_path)
        bootstrap_ms = (datetime.now(timezone.utc) - bootstrap_started).total_seconds() * 1000

        logger.info(
            "[DUCKDB ATTEMPT] dataset_id=%s version_id=%s path=%s exists=%s bootstrap_ms=%.1f",
            dataset_id,
            version_id,
            duckdb_path,
            os.path.exists(str(duckdb_path)),
            bootstrap_ms,
        )

        conn = duckdb.connect(str(duckdb_path), read_only=True)

        duckdb_charts = execute_chart_queries(
            conn=conn,
            chart_configs=chart_configs,
            filters=state.active_filters or {},
            target_column=target_col,
            target_value=state.target_value or "all",
        )

        merged = {
            slot: {**chart, "data": duckdb_charts.get(slot, chart.get("data", []))}
            for slot, chart in charts_full.items()
        }

        return {
            "success": True,
            "charts": merged,
            "reason": "duckdb_filtered",
            "duckdb_slots": list(chart_configs.keys())
        }
    except Exception as exc:
        logger.exception("[DUCKDB FALLBACK] reason=%s", exc)
        return {
            "success": False,
            "reason": "duckdb_error",
            "error": str(exc),
        }
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def _backfill_date_trends_with_duckdb(
    *,
    dataset_id: UUID,
    version_id: UUID,
    csv_path: str,
    charts: Dict[str, Dict[str, Any]],
    date_columns: List[str],
    filters: Optional[Dict[str, List[str]]] = None,
    target_col: Optional[str] = None,
    target_value: str = "all",
) -> Dict[str, Dict[str, Any]]:
    """Replace date trend chart data with DuckDB month-truncated results for consistency with chat SQL."""
    chart_configs: Dict[str, Dict[str, Any]] = {}
    for slot, chart in (charts or {}).items():
        ctype = str(chart.get("type") or "").lower()
        dim = chart.get("dimension")
        if ctype not in {"line", "area"}:
            continue
        if not dim or dim not in date_columns:
            continue

        chart_configs[slot] = {
            "type": chart.get("type", "line"),
            "dimension": dim,
            "metric": chart.get("metric"),
            "aggregation": chart.get("aggregation", "sum"),
            "granularity": chart.get("granularity"),
            "is_date": True,
            "x_column": chart.get("x_column"),
            "y_column": chart.get("y_column"),
        }

    if not chart_configs:
        return charts

    conn = None
    try:
        duckdb_path = get_or_build_duckdb(dataset_id, version_id, csv_path)
        conn = duckdb.connect(str(duckdb_path), read_only=True)

        duckdb_trends = execute_chart_queries(
            conn=conn,
            chart_configs=chart_configs,
            filters=filters or {},
            target_column=target_col,
            target_value=target_value or "all",
        )

        merged = {**charts}
        for slot, rows in duckdb_trends.items():
            normalized_rows = []
            for row in rows or []:
                raw_date = row.get("date") or row.get("timestamp") or row.get("name")
                if raw_date is None:
                    continue
                ts = pd.to_datetime(raw_date, errors="coerce")
                if pd.notna(ts):
                    label = ts.strftime("%b %Y")
                    iso_date = str(ts.date())
                else:
                    label = str(raw_date)
                    iso_date = str(raw_date)

                try:
                    value = float(row.get("value", 0))
                except (TypeError, ValueError):
                    value = 0.0

                normalized_rows.append(
                    {
                        "timestamp": label,
                        "date": iso_date,
                        "value": value,
                    }
                )

            if slot in merged and normalized_rows:
                merged[slot] = {**merged[slot], "data": normalized_rows}

        return merged
    except Exception as exc:
        logger.exception("[DUCKDB TREND BACKFILL FALLBACK] reason=%s", exc)
        return charts
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


# =============================================================================
# API Endpoints
# =============================================================================


@router.post(
    "/analytics/dashboard",
    response_model=DashboardAnalyticsResponse,
    summary="Get dashboard analytics",
)
def get_dashboard_analytics(  # pyright: ignore
    state: DashboardStateRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> DashboardAnalyticsResponse:
    """
    Get analytics data for user dashboard.
    
    Uses intelligent domain detection to generate appropriate KPIs and charts.
    """
    try:
        logger.info(
            "[DASHBOARD REQUEST] dataset_id=%s target_value=%s active_filter_keys=%s active_filter_count=%s",
            state.dataset_id,
            state.target_value,
            list((state.active_filters or {}).keys()),
            sum(len(v) for v in (state.active_filters or {}).values() if isinstance(v, list)),
        )

        if not state.dataset_id:
            raise HTTPException(status_code=400, detail="Please provide a dataset_id")
        
        # Load dataset
        latest_version = get_latest_version(session=session, dataset_id=state.dataset_id)
        if not latest_version:
            raise HTTPException(status_code=404, detail="Version not found")

        # Prefer cleaned data when available, fall back to raw
        file_path = (
            latest_version.cleaned_reference
            if latest_version.cleaned_reference
            else latest_version.source_reference
        )
        df = safe_read_csv(file_path)
        
        # Detect domain
        domain, scores = detect_domain(df)
        
        # Apply manual domain override if provided
        if state.selected_domain and state.selected_domain.lower() != 'auto':
            try:
                # Validate the domain exists in DomainType
                domain = DomainType(state.selected_domain.lower())
            except ValueError:
                # Log warning and fall back to detected domain if invalid override provided
                print(f"Warning: Invalid domain override '{state.selected_domain}', falling back to detected: {domain}")
        
        confidence = get_domain_confidence(scores)
        
        # Classify columns
        classification = filter_columns(df, domain)
        
        # Apply classification overrides
        if state.classification_overrides:
            for col, role in state.classification_overrides.items():
                if col in df.columns:
                    # Remove from current lists
                    if col in classification.metrics: classification.metrics.remove(col)
                    if col in classification.dimensions: classification.dimensions.remove(col)
                    if col in classification.targets: classification.targets.remove(col)
                    if col in classification.dates: classification.dates.remove(col)
                    if col in classification.excluded: classification.excluded.remove(col)
                    
                    # Add to new list
                    role_lower = role.lower()
                    if role_lower.startswith('metric'):
                        classification.metrics.append(col)
                    elif role_lower == 'dimension':
                        classification.dimensions.append(col)
                    elif role_lower == 'target':
                        classification.targets.append(col)
                    elif role_lower == 'date':
                        classification.dates.append(col)
                    elif role_lower == 'excluded':
                        classification.excluded.append(col)
        
        # Find target column for filtering
        target_col = classification.targets[0] if classification.targets else _find_target_column(df)
        target_values = []
        if target_col:
            target_values = [str(x) for x in df[target_col].dropna().unique()]
            target_values = _normalize_binary_target_values(target_col, target_values)
        
        # Apply target filter if specified
        df_filtered = df.copy()
        if state.target_value and state.target_value.lower() != 'all' and target_col:
            filter_norm = _normalize_filter_value(state.target_value)
            
            # Expanded keyword matching for binary and generic values
            POSITIVE_KEYWORDS = {'1', '1.0', 'yes', 'true', 'y', 'positive', 'churned', 'churn', 
                               'exited', 'attrited', 'left', 'cancelled', 'canceled', 'defaulted', 'inactive'}
            NEGATIVE_KEYWORDS = {'0', '0.0', 'no', 'false', 'n', 'negative', 'retained', 'stayed', 
                               'active', 'performing'}
            
            if filter_norm in POSITIVE_KEYWORDS:
                # User selected "Positive" category - match all positive binary representations
                matches = []
                for idx, val in enumerate(df[target_col]):
                    if _binary_target_value_match(val, 'yes'):  # Treat as positive
                        matches.append(idx)
                df_filtered = df.iloc[matches].copy() if matches else df.iloc[[]].copy()
            elif filter_norm in NEGATIVE_KEYWORDS:
                # User selected "Negative" category - match all negative binary representations
                matches = []
                for idx, val in enumerate(df[target_col]):
                    if _binary_target_value_match(val, 'no'):  # Treat as negative
                        matches.append(idx)
                df_filtered = df.iloc[matches].copy() if matches else df.iloc[[]].copy()
            else:
                # Non-binary value: use smart scalar matching
                matches = []
                for idx, val in enumerate(df[target_col]):
                    if _scalar_filter_match(val, state.target_value):
                        matches.append(idx)
                df_filtered = df.iloc[matches].copy() if matches else df.iloc[[]].copy()
        
        # Parse and apply multi-column filters with smart matching
        active_filters = state.active_filters or {}
        
        for col, values in active_filters.items():
            if col not in df_filtered.columns or not values:
                continue

            col_series_for_match = df[col] if col in df.columns else df_filtered[col]
            should_apply_binary_semantic = bool(
                (target_col and col == target_col)
                or (col_series_for_match.dropna().nunique() == 2)
            )
            
            # For each row, check if ANY of the filter values match
            matches = []
            for idx, row_val in enumerate(df_filtered[col]):
                for filter_val in values:
                    # Use smart matching that handles case, type, and binary equivalence
                    if _scalar_filter_match(row_val, filter_val):
                        matches.append(idx)
                        break  # Found a match for this row, move to next row
                    # Only apply binary semantic equivalence on true binary columns or target column.
                    elif should_apply_binary_semantic and _binary_target_value_match(row_val, filter_val):
                        matches.append(idx)
                        break
            
            df_filtered = df_filtered.iloc[matches].copy() if matches else df_filtered.iloc[[]].copy()
        
        # Log filter impact for debugging
        is_filtered = len(df_filtered) < len(df)
        if is_filtered:
            filter_impact = {
                'original_rows': len(df),
                'filtered_rows': len(df_filtered),
                'reduction_pct': round((1 - len(df_filtered) / len(df)) * 100, 1) if len(df) > 0 else 0,
                'target_filter': state.target_value if state.target_value and state.target_value.lower() != 'all' else None,
                'active_filters': list(active_filters.keys()) if active_filters else None
            }
            logger.info("[FILTER DEBUG] %s", filter_impact)
        
        # Extract filter options for ALL dimension columns (not just geo)
        # This allows filtering by Category, Segment, Region, Product, etc.
        geo_filters = {}
        geo_filters_truncated: Dict[str, int] = {}  # {dim: total_count} for truncated dims
        for dim in classification.dimensions:
            unique_count = df[dim].nunique()
            if unique_count < 2:
                continue
            if unique_count <= 500:
                unique_vals = df[dim].dropna().unique()
                geo_filters[dim] = sorted([str(v) for v in unique_vals])
            elif unique_count <= 1000:
                # Include top 50 sorted values; mark as truncated
                unique_vals = df[dim].dropna().value_counts().head(50).index.tolist()
                geo_filters[dim] = sorted([str(v) for v in unique_vals])
                geo_filters_truncated[dim] = unique_count
        
        # Generate KPIs from filtered data (values should reflect filters)
        kpis = generate_kpis(df_filtered, domain, classification)

        # FIX: Chart STRUCTURE (which charts appear) is determined from the FULL dataset.
        # Only DATA values are recomputed from df_filtered.
        # This prevents new charts appearing / old ones disappearing when a filter is applied,
        # which is how Power BI / Tableau / Looker behave.
        charts_full = recommend_charts(df, domain, classification, overrides=state.chart_overrides)

        is_filtered = len(df_filtered) < len(df)

        # Try DuckDB first for filtered chart values. If not available/ready,
        # fall back to existing pandas recomputation logic.
        duckdb_result = _try_duckdb_analytics(
            state=state,
            dataset_id=state.dataset_id,
            version_id=latest_version.id,
            csv_path=file_path,
            charts_full=charts_full,
            date_columns=classification.dates,
            target_col=target_col,
        )

        logger.info(
            "[DASHBOARD ENGINE] filtered=%s duckdb_success=%s reason=%s",
            is_filtered,
            bool(duckdb_result.get("success")),
            duckdb_result.get("reason"),
        )

        # If anything filtered the dataset, regenerate chart values from the filtered subset.
        # Chart structure is still anchored to charts_full; only data payloads are replaced.
        if is_filtered:
            charts_filtered = recommend_charts(df_filtered, domain, classification, overrides=state.chart_overrides)

            def _norm_chart_key_part(value: Any) -> str:
                return str(value or "").strip().lower()

            def _chart_identity_key(chart_obj: Dict[str, Any]) -> tuple[str, str, str, str, str]:
                return (
                    _norm_chart_key_part(chart_obj.get("title")),
                    _norm_chart_key_part(chart_obj.get("type")),
                    _norm_chart_key_part(chart_obj.get("dimension")),
                    _norm_chart_key_part(chart_obj.get("metric")),
                    _norm_chart_key_part(chart_obj.get("aggregation") or "sum"),
                )

            # Build identity lookup; this avoids slot/title drift under filtering.
            filtered_by_identity: Dict[tuple[str, str, str, str, str], Any] = {
                _chart_identity_key(v): v for v in charts_filtered.values()
            }

            from app.services.analytics.chart_recommender import (
                _smart_aggregate, _safe_groupby_sum, _safe_groupby_mean, 
                _get_time_trend, _get_churn_rate_by_segment, _get_value_at_risk,
                _get_stacked_churn_counts, _get_lifecycle_cohorts, _distribution_chart,
                _get_churn_count_by_segment, _get_churned_vs_retained_avg, _safe_value_counts,
                _safe_to_datetime,
            )

            charts: Dict[str, Any] = {}
            duckdb_success = duckdb_result.get("success", False)
            duckdb_slots = set(duckdb_result.get("duckdb_slots", []))
            
            for slot, full_chart in charts_full.items():
                title = full_chart["title"]
                full_identity = _chart_identity_key(full_chart)

                # Strict identity match only; otherwise recompute from full_chart metadata.
                flt = filtered_by_identity.get(full_identity)

                if duckdb_success and slot in duckdb_slots:
                    charts[slot] = duckdb_result["charts"][slot]
                elif flt and flt.get("data"):
                    # Correct match: same chart identity found in filtered run.
                    charts[slot] = {**full_chart, "data": flt["data"]}
                elif full_chart.get("dimension"):
                    # Chart dropped by recommendation engine (e.g. due to nunique < 2).
                    # Manually re-aggregate if we have the metadata.
                    dim = full_chart["dimension"]
                    met = full_chart.get("metric")
                    agg = full_chart.get("aggregation", "sum")
                    agg_norm = str(agg or "sum").strip().lower()
                    ctype = full_chart["type"]
                    
                    try:
                        manual_data = []
                        # 1. Specialized Categorical Handling (Churn / Rates / Counts)
                        if met == target_col or (not met and 'Churn' in title):
                            if ctype == 'stacked_bar' or ctype == 'stacked':
                                manual_data = _get_stacked_churn_counts(df_filtered, target_col, dim)
                            elif agg_norm == 'count' or 'Volume' in title or 'Count' in title:
                                manual_data = _get_churn_count_by_segment(df_filtered, target_col, dim)
                            else:
                                # Default to Rate for Churn targets
                                # FIX: Use df_filtered.nunique() not df.nunique() to check filtered data cardinality
                                if pd.api.types.is_numeric_dtype(df_filtered[dim]) and df_filtered[dim].nunique() > 10:
                                    manual_data = _get_lifecycle_cohorts(df_filtered, dim, target_col)
                                else:
                                    manual_data = _get_churn_rate_by_segment(df_filtered, target_col, dim)
                        
                        # 2. Financial / Time / Numeric Handling
                        elif ctype in ('line', 'area', 'area_bounds'):
                            if dim in classification.dates:
                                if met:
                                    manual_data = _get_time_trend(df_filtered, dim, met, aggregation=str(agg))
                                else:
                                    # Count-based trends (no explicit metric) must aggregate row counts,
                                    # not fallback to an arbitrary metric column.
                                    df_time = df_filtered[[dim]].copy()
                                    df_time[dim] = _safe_to_datetime(df_time[dim])
                                    df_time = df_time.dropna(subset=[dim]).sort_values(dim)
                                    if not df_time.empty:
                                        trend = df_time.groupby(pd.Grouper(key=dim, freq='MS')).size()
                                        manual_data = [
                                            {
                                                "timestamp": k.strftime('%b %Y'),
                                                "date": str(k.date()),
                                                "value": int(v),
                                            }
                                            for k, v in trend.items()
                                        ]
                            elif met:
                                manual_data = _safe_groupby_mean(df_filtered, dim, met)
                        
                        elif 'at Risk' in title and met:
                            manual_data = _get_value_at_risk(df_filtered, target_col, dim, met)
                        
                        # 3. Scatter Chart Handling (Raw X/Y Pairs)
                        elif ctype == 'scatter':
                            if dim and met:
                                from app.services.analytics.chart_recommender import _get_scatter_data
                                manual_data = _get_scatter_data(df_filtered, dim, met, limit=500)
                                
                        # 3.5. Geo Map Multiple Metric Fallback
                        elif ctype == 'geo_map' and full_chart.get('geo_meta') and full_chart['geo_meta'].get('metrics'):
                            try:
                                from app.services.analytics.chart_recommender import _beautify_column_name
                                target_metrics_beautiful = set(full_chart['geo_meta']['metrics'])
                                metrics_to_sum = [m for m in classification.metrics if _beautify_column_name(m) in target_metrics_beautiful]
                                if not metrics_to_sum and met: metrics_to_sum = [met]
                                
                                if metrics_to_sum:
                                    pm = metrics_to_sum[0]
                                    grouped = df_filtered.groupby(dim)
                                    primary_aggs = grouped[pm].sum().sort_values(ascending=False).head(100)
                                    sec_aggs = {m: grouped[m].sum() for m in metrics_to_sum[1:]}
                                    
                                    for g_name, p_val in primary_aggs.items():
                                        if pd.isna(p_val): continue
                                        entry = {"name": str(g_name), "value": round(float(p_val), 2)}
                                        m_dict = {_beautify_column_name(pm): round(float(p_val), 2)}
                                        for m, sg in sec_aggs.items():
                                            m_dict[_beautify_column_name(m)] = round(float(sg.get(g_name, 0)), 2)
                                        entry["metrics"] = m_dict
                                        manual_data.append(entry)
                            except Exception as e:
                                print(f"Geo Map fallback error: {e}")
                        
                        # 4. Generic Fallback Re-aggregation (Numeric vs Distribution)
                        if not manual_data:
                            if met and pd.api.types.is_numeric_dtype(df[met]):
                                if agg_norm in {'mean', 'avg', 'average'}:
                                    manual_data = _safe_groupby_mean(df_filtered, dim, met)
                                else:
                                    manual_data = _safe_groupby_sum(df_filtered, dim, met)
                            else:
                                # Distribution charts for categorical inputs or fallback
                                from app.services.analytics.chart_recommender import _format_categorical_value
                                manual_data = _safe_value_counts(df_filtered, dim, limit=15)
                                # Format categorical values with proper column semantics (Yes/No for Partner, Churned/Retained for Churn, etc.)
                                for d in manual_data:
                                    d['name'] = _format_categorical_value(dim, d['name'])
                        
                        charts[slot] = {**full_chart, "data": manual_data or []}
                    except Exception as e:
                        print(f"Error in manual re-aggregation for {title}: {e}")
                        # Final resort: raw value counts of the dimension
                        try:
                            from app.services.analytics.chart_recommender import _format_categorical_value
                            fallback_counts = _safe_value_counts(df_filtered, dim, limit=15)
                            # Format categorical values with proper column semantics
                            for d in fallback_counts:
                                d['name'] = _format_categorical_value(dim, d['name'])
                            charts[slot] = {**full_chart, "data": fallback_counts}
                        except Exception as e:
                            print(f"Final resort failed for {title}: {e}")
                            charts[slot] = {**full_chart, "data": []}
                else:
                    # FIX: Handle charts WITHOUT dimensions (e.g., "Churn Overview" donut, "Churned/Retained" split)
                    # These typically have metric=target_col and type=donut/pie
                    met = full_chart.get("metric")
                    ctype = full_chart["type"]
                    
                    try:
                        manual_data = []
                        # Target distribution charts: "Churn Overview", "Exit Distribution", etc.
                        if (met == target_col or not met) and ctype in ('donut', 'pie'):
                            # Re-aggregate target distribution from filtered data
                            manual_data = _safe_value_counts(df_filtered, target_col, limit=10) if target_col and target_col in df_filtered.columns else []
                            if manual_data and target_col:
                                from app.services.analytics.chart_recommender import _format_categorical_value
                                for d in manual_data:
                                    d['name'] = _format_categorical_value(target_col, d['name'])
                        else:
                            # Generic fallback for other no-dimension charts
                            charts[slot] = {**full_chart, "data": []}
                        
                        if manual_data:
                            charts[slot] = {**full_chart, "data": manual_data}
                        else:
                            charts[slot] = {**full_chart, "data": []}
                    except Exception as e:
                        print(f"Error handling no-dimension chart {title}: {e}")
                        charts[slot] = {**full_chart, "data": []}
        else:
            charts = charts_full

        # Enforce chat-consistent month trend semantics for both initial and filtered dashboard loads.
        charts = _backfill_date_trends_with_duckdb(
            dataset_id=state.dataset_id,
            version_id=latest_version.id,
            csv_path=file_path,
            charts=charts,
            date_columns=classification.dates,
            filters=state.active_filters or {},
            target_col=target_col,
            target_value=state.target_value or "all",
        )


        
        dataset = session.get(Dataset, state.dataset_id)
        dataset_name = dataset.name if dataset else latest_version.source_reference.split('/')[-1]

        # Prepare raw data payload (50k limit) with Stratified Sampling
        max_raw_rows = 50000
        total_len = len(df)
        
        if total_len <= max_raw_rows:
            df_raw = df.copy()
        else:
            # Prefer primary dimension from recommendations for stratification
            primary_dim = None
            for chart in charts_full.values():
                d = chart.get("dimension")
                if d and d in df.columns and df[d].nunique() > 1:
                    primary_dim = d
                    break
            
            if primary_dim:
                # Sample proportionally per group, then take top/random to fill budget
                frac = max_raw_rows / total_len
                sampled_parts = []
                for _, group_df in df.groupby(primary_dim, sort=False):
                    if len(group_df) == 0:
                        continue
                    sample_n = min(len(group_df), max(1, int(len(group_df) * frac)))
                    sampled_parts.append(group_df.sample(n=sample_n, random_state=42))
                df_raw = pd.concat(sampled_parts) if sampled_parts else df.head(0).copy()
                # If we undersampled due to rounding, fill up with random sample from remainders
                if len(df_raw) < max_raw_rows:
                    remaining_indices = df.index.difference(df_raw.index)
                    if not remaining_indices.empty:
                        extra_n = min(max_raw_rows - len(df_raw), len(remaining_indices))
                        extra_df = df.loc[remaining_indices].sample(n=extra_n, random_state=42)
                        df_raw = pd.concat([df_raw, extra_df])
                elif len(df_raw) > max_raw_rows:
                    df_raw = df_raw.sample(n=max_raw_rows, random_state=42)
            else:
                df_raw = df.sample(n=max_raw_rows, random_state=42).reset_index(drop=True)
                
        # Final safety: Ensure no NaN/Infinity break the JSON response
        raw_data_payload = df_raw.replace([np.inf, -np.inf], np.nan).where(pd.notnull(df_raw), None).to_dict(orient="records")

        # Prepare chart configs (extract structural info from charts_full)
        chart_configs = {}
        for slot, chart in charts_full.items():
            dim = chart.get("dimension")
            chart_configs[slot] = {
                "title": chart["title"],
                "type": chart["type"],
                "dimension": dim,
                "metric": chart.get("metric"),
                "aggregation": chart.get("aggregation"),
                "granularity": chart.get("granularity"),
                "is_date": dim in classification.dates if dim else False
            }

        # Data quality: null % per column
        total = len(df)
        data_quality = []
        for col in df.columns:
            null_count = int(df[col].isna().sum())
            null_pct = round(null_count / total * 100, 1) if total > 0 else 0
            dtype = str(df[col].dtype)
            action = "coerced" if col in classification.metrics and df[col].dtype.name in ['float64', 'int64'] else "none"
            data_quality.append({"column": col, "null_pct": null_pct, "null_count": null_count, "dtype": dtype, "action": action})

        # Track base dashboard generations for profile analytics.
        # Avoid counting transient UI filter/override recomputes as full generations.
        is_base_generation = (
            (not state.active_filters)
            and (not state.chart_overrides)
            and (not state.classification_overrides)
            and ((not state.target_value) or str(state.target_value).lower() == "all")
        )
        if is_base_generation:
            try:
                import json as _json

                tracking_user_id = UUID(current_user.user_id)
                tracking_role = ModelUserRole(current_user.role.value)

                # Query ALL versions for this dataset so re-cleaning / re-upload
                # doesn't create duplicate dashboard tracking records.
                all_version_ids = [
                    v.id for v in session.exec(
                        select(DatasetVersion).where(
                            DatasetVersion.dataset_id == state.dataset_id,
                            DatasetVersion.is_active == True,
                        )
                    ).all()
                ]

                existing_dashboard_results = []
                if all_version_ids:
                    existing_dashboard_results = list(session.exec(
                        select(AnalysisResult).where(
                            AnalysisResult.dataset_version_id.in_(all_version_ids),
                            AnalysisResult.generated_by == tracking_user_id,
                            AnalysisResult.is_active == True,
                        )
                    ))

                def _is_dashboard_payload(payload) -> bool:
                    """Check if payload has type 'dashboard', handling both dict and JSON string."""
                    if isinstance(payload, str):
                        try:
                            payload = _json.loads(payload)
                        except (ValueError, TypeError):
                            return False
                    if isinstance(payload, dict):
                        return str(payload.get("type")) == "dashboard" and payload.get("source") == "dashboard_page"
                    return False

                already_tracked = any(
                    _is_dashboard_payload(row.result_payload)
                    for row in existing_dashboard_results
                )

                if already_tracked:
                    contract = None
                else:
                    contract = session.exec(
                        select(AnalysisContract).where(
                            AnalysisContract.dataset_version_id == latest_version.id,
                            AnalysisContract.is_active == True,
                        )
                    ).first()

                if not already_tracked and not contract:
                    contract = create_analysis_contract(
                        session=session,
                        dataset_version_id=latest_version.id,
                        allowed_metrics={"metrics": classification.metrics},
                        allowed_dimensions={"dimensions": classification.dimensions},
                        user_id=tracking_user_id,
                        role=tracking_role,
                        constraints={"source": "dashboard_page_auto"},
                    )

                if not already_tracked and contract:
                    create_analysis_result(
                        session=session,
                        dataset_version_id=latest_version.id,
                        analysis_contract_id=contract.id,
                        result_payload={
                            "type": "dashboard",
                            "source": "dashboard_page",
                            "domain": domain.value,
                            "dataset_id": str(state.dataset_id),
                            "kpi_count": len(kpis or {}),
                            "chart_count": len(charts or {}),
                        },
                        user_id=tracking_user_id,
                        role=tracking_role,
                    )
            except AuthorizationError:
                # Tracking is best-effort; skip when user cannot write contract/result for this dataset.
                pass
            except Exception as track_err:
                print(f"Warning: dashboard generation tracking failed: {track_err}")


        return DashboardAnalyticsResponse(
            dataset_name=dataset_name,
            total_rows=len(df),
            domain=domain.value,
            domain_confidence=confidence,
            kpis=kpis,
            charts=charts,
            columns={
                "dimensions": classification.dimensions,
                "metrics": classification.metrics,
                "targets": classification.targets,
                "dates": classification.dates,
                "excluded": classification.excluded
            },
            target_column=target_col,
            target_values=target_values,
            geo_filters=geo_filters,
            raw_data=raw_data_payload,
            chart_configs=chart_configs,
            data_quality=data_quality,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing dataset: {str(e)}"
        )


@router.get(
    "/analytics/pivot",
    summary="Get pivot table data",
)
def get_pivot_table(
    session: DBSession,
    current_user: AuthenticatedUser,
    dataset_id: Optional[UUID] = None,
) -> Dict[str, Any]:
    """
    Get auto-generated pivot table data for a dataset.
    
    Uses domain detection to generate the optimal pivot configuration.
    """
    try:
        if not dataset_id:
            raise HTTPException(status_code=400, detail="Please provide a dataset_id")
        
        # Load dataset
        latest_version = get_latest_version(session=session, dataset_id=dataset_id)
        if not latest_version:
            raise HTTPException(status_code=404, detail="Version not found")
            
        file_path = (
            latest_version.cleaned_reference
            if latest_version.cleaned_reference
            else latest_version.source_reference
        )
        df = safe_read_csv(file_path)
        
        # Detect domain
        domain, _ = detect_domain(df)
        
        # Classify columns
        classification = filter_columns(df, domain)
        
        # Generate pivot configuration
        pivot_config = generate_pivot_config(df, classification, domain.value)
        
        # Generate pivot data
        pivot_data = generate_pivot_data(df, pivot_config)
        
        return {
            "success": True,
            "domain": domain.value,
            "pivot": pivot_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating pivot table: {str(e)}"
        )


@router.get(
    "/analytics/correlation",
    summary="Get feature correlation matrix",
)
def get_correlation_matrix(
    session: DBSession,
    current_user: AuthenticatedUser,
    dataset_id: Optional[UUID] = None,
    max_cols: int = 10,
) -> Dict[str, Any]:
    """
    Compute Pearson correlation matrix for numeric columns.

    Returns:
        labels:        original column names
        displayLabels: truncated display names
        matrix:        2D list [row][col] of correlation values
        pairs:         flat [{row, col, rowLabel, colLabel, value}]
        n:             matrix size
    """
    try:
        if not dataset_id:
            raise HTTPException(status_code=400, detail="Please provide a dataset_id")

        latest_version = get_latest_version(session=session, dataset_id=dataset_id)
        if not latest_version:
            raise HTTPException(status_code=404, detail="Version not found")

        file_path = (
            latest_version.cleaned_reference
            if latest_version.cleaned_reference
            else latest_version.source_reference
        )
        df = safe_read_csv(file_path)

        # Select numeric columns — drop constants, near-binary, sparse
        numeric = df.select_dtypes(include=["number"])
        numeric = numeric.loc[:, numeric.std() > 1e-6]
        numeric = numeric.loc[:, numeric.nunique() > 2]
        numeric = numeric.dropna(axis=1, thresh=int(len(df) * 0.5))

        # Limit to max_cols most-variant columns
        if len(numeric.columns) > max_cols:
            top_cols = numeric.std().nlargest(max_cols).index.tolist()
            numeric = numeric[top_cols]

        if len(numeric.columns) < 2:
            raise HTTPException(
                status_code=422,
                detail="Not enough numeric columns to compute correlation (need ≥2).",
            )

        corr = numeric.corr(method="pearson").round(3)
        labels = corr.columns.tolist()
        display_labels = [lbl if len(lbl) <= 14 else lbl[:13] + "…" for lbl in labels]
        matrix = corr.values.tolist()

        def _to_corr_float(value: Any) -> float:
            try:
                if isinstance(value, complex):
                    return float(value.real)
                return float(value)
            except (TypeError, ValueError):
                return 0.0

        pairs = [
            {
                "row": ri,
                "col": ci,
                "rowLabel": labels[ri],
                "colLabel": labels[ci],
                "value": round(_to_corr_float(corr.iloc[ri, ci]), 3),
            }
            for ri in range(len(labels))
            for ci in range(len(labels))
        ]

        return {
            "labels": labels,
            "displayLabels": display_labels,
            "matrix": matrix,
            "pairs": pairs,
            "n": len(labels),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error computing correlation: {str(e)}",
        )


# =============================================================================
# Dashboard Insight Narrative
# =============================================================================

class NarrativeRequest(BaseModel):
    """Request payload for generating a dashboard insight narrative."""
    dataset_id: UUID
    kpis: Dict[str, Any]
    domain: str
    dataset_name: str
    charts: Optional[Dict[str, Any]] = None


NARRATIVE_SYSTEM_PROMPT = """You are a senior data analyst generating an executive insight brief for a BI dashboard.

Your job is to analyze ALL the KPIs AND chart breakdowns provided and write clear, factual insights.

Output format — write exactly 5-7 numbered points, each on its own block with a blank line between points.
Every point MUST follow this strict pattern:
<number>. <Heading>: <Description>

Heading requirements:
- 2 to 5 words maximum.
- Title Case.
- Specific and data-grounded (not generic labels like "Insight 1", "Observation", "Key Finding").

Description requirements:
- One concise sentence that includes at least one concrete metric (value, percentage, count, or change).
- Must reference specific categories/segments/periods when available.

Example output format:
1. Revenue Momentum: Total revenue is $2.3M with a +12.3% trend, driven by Q4 performance.

2. State Concentration Risk: California contributes $763K (33%) while Texas posts a -$25.7K loss.

3. Contract Churn Pressure: Month-to-month contracts represent 89% of churned customers.

Rules:
- Start each point with the point number followed by a period and space.
- Put a blank line between every point.
- Use actual numbers and percentages from the data provided.
- Do NOT use markdown formatting, bold, bullets, or special symbols.
- Do NOT invent data. Only reference what is explicitly provided.
- Write in third person."""


def _summarize_charts(charts: Dict[str, Any], max_charts: int = 8, currency_symbol: str = "$") -> str:
    """Build a concise text summary of chart data for the LLM prompt."""
    if not charts:
        return ""

    summaries = []
    count = 0

    for chart_id, chart in charts.items():
        if count >= max_charts:
            break

        title = chart.get("title", chart_id)
        chart_type = chart.get("type", "unknown")
        data = chart.get("data", [])

        if not isinstance(data, list) or len(data) == 0:
            continue

        first_row = data[0]
        if not isinstance(first_row, dict):
            continue

        keys = list(first_row.keys())
        # Identify dimension (string) and metric (number) columns
        dim_col = next((k for k in keys if isinstance(first_row.get(k), str)), keys[0])
        metric_col = next((k for k in keys if isinstance(first_row.get(k), (int, float))), None)

        if not metric_col:
            continue

        # Extract values
        rows = [(row.get(dim_col, "?"), row.get(metric_col, 0)) for row in data if row.get(metric_col) is not None]
        if not rows:
            continue

        values = [v for _, v in rows]
        total = sum(values) if values else 0
        metric_is_currency = _is_currency_label(f"{title} {metric_col}")

        # Build summary based on chart type
        if chart_type in ("pie", "donut", "doughnut"):
            # Show top 3 segments with percentages
            sorted_rows = sorted(rows, key=lambda x: x[1], reverse=True)
            top = sorted_rows[:3]
            parts = [
                f"{name}: {_format_narrative_value(val, metric_is_currency, currency_symbol)} ({val/total*100:.1f}%)"
                if total else f"{name}: {_format_narrative_value(val, metric_is_currency, currency_symbol)}"
                for name, val in top
            ]
            total_txt = _format_narrative_value(total, metric_is_currency, currency_symbol) if total else ""
            summaries.append(f"[{title}] Distribution — {', '.join(parts)}" + (f" (total: {total_txt})" if total else ""))

        elif chart_type in ("line", "area"):
            # Show start, end, direction
            if len(rows) >= 2:
                start_name, start_val = rows[0]
                end_name, end_val = rows[-1]
                direction = "increasing" if end_val > start_val else "decreasing" if end_val < start_val else "flat"
                pct = ((end_val - start_val) / start_val * 100) if start_val != 0 else 0
                start_txt = _format_narrative_value(start_val, metric_is_currency, currency_symbol)
                end_txt = _format_narrative_value(end_val, metric_is_currency, currency_symbol)
                summaries.append(f"[{title}] Trend — {direction} from {start_txt} ({start_name}) to {end_txt} ({end_name}), change: {pct:+.1f}%")

        else:
            # bar, hbar, etc — show top 3 and bottom 1
            sorted_rows = sorted(rows, key=lambda x: x[1], reverse=True)
            top3 = sorted_rows[:3]
            bottom1 = sorted_rows[-1] if len(sorted_rows) > 3 else None

            parts = [f"{name}: {_format_narrative_value(val, metric_is_currency, currency_symbol)}" for name, val in top3]
            line = f"[{title}] Top — {', '.join(parts)}"
            if bottom1:
                line += f" | Lowest — {bottom1[0]}: {_format_narrative_value(bottom1[1], metric_is_currency, currency_symbol)}"
            summaries.append(line)

        count += 1

    return "\n".join(summaries)


@router.post("/analytics/narrative")
async def generate_narrative(
    payload: NarrativeRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
):
    """Generate an AI insight narrative for the current dashboard state."""
    from app.core.llm_client import get_llm_client
    from app.services.dataset_service import check_dataset_access

    try:
        # Authorization check
        if not check_dataset_access(
            session,
            payload.dataset_id,
            UUID(current_user.user_id),
            ModelUserRole(current_user.role.value),
        ):
            raise HTTPException(status_code=403, detail="Unauthorized access to dataset.")

        # Determine narrative currency symbol
        currency_symbol = _currency_symbol_from_code("USD")
        for _, kpi in payload.kpis.items():
            symbol = kpi.get("currency_symbol")
            if isinstance(symbol, str) and symbol.strip():
                currency_symbol = symbol.strip()
                break

        # Build KPI summary
        kpi_lines = []
        for key, kpi in payload.kpis.items():
            title = kpi.get("title", key)
            value = kpi.get("value", "N/A")
            fmt = kpi.get("format", "number")
            is_currency = str(fmt).lower() == "currency" or _is_currency_label(title)
            value_txt = _format_narrative_value(value, is_currency=is_currency, currency_symbol=currency_symbol)
            trend = kpi.get("trend")
            trend_str = ""
            if trend is not None:
                try:
                    trend_val = float(trend)
                    trend_str = f" (trend: {trend_val:+.1f}%)"
                except (ValueError, TypeError):
                    trend_str = " (trend: --)"
            kpi_lines.append(f"- {title}: {value_txt} [{fmt}]{trend_str}")

        kpi_summary = "\n".join(kpi_lines)

        # Build chart summary
        chart_summary = ""
        if payload.charts:
            chart_summary = _summarize_charts(payload.charts, currency_symbol=currency_symbol)

        # Compose user prompt
        user_prompt = f"""Dataset: {payload.dataset_name}
Domain: {payload.domain}

KPI Results:
{kpi_summary}"""

        if chart_summary:
            user_prompt += f"""

Chart Breakdowns:
{chart_summary}"""

        user_prompt += "\n\nAnalyze all the data above and write an executive insight brief."

        client = get_llm_client()
        response = await client.complete(
            system_prompt=NARRATIVE_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=512,
            purpose="dashboard_narrative",
        )

        return {"narrative": response.content.strip()}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating narrative: {str(e)}",
        )
