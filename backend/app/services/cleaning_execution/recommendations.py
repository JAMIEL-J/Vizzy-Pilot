"""
Recommendations generator module.

Belongs to: cleaning_execution
Responsibility: Generate fix recommendations based on inspection findings
Restrictions: Pure computation, no I/O
"""

from typing import Any, Dict, List
from uuid import uuid4


def generate_recommendations(
    profiling: Dict[str, Any],
    anomalies: Dict[str, Any],
    duplicates: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Generate fix recommendations based on inspection findings.

    Args:
        profiling: Column profiling stats (from profiler.py)
        anomalies: Anomaly detection results (from anomaly_checks.py)
        duplicates: Duplicate detection results (from duplicate_checks.py)

    Returns:
        List of recommendations:
        [
            {
                "id": "rec_uuid",
                "issue_type": "missing_values",
                "column": "age",
                "severity": "high" | "medium" | "low",
                "strategy": "fill_mean",
                "strategy_options": ["fill_mean", "fill_median", "drop_rows"],
                "description": "Fill 247 missing values in 'age' with mean",
                "impact": "Affects 2.9% of rows"
            },
            ...
        ]
    """
    recommendations: List[Dict[str, Any]] = []

    # --- Missing Values Recommendations ---
    columns = profiling.get("columns", {})
    row_count = profiling.get("row_count", 0)

    for col_name, col_info in columns.items():
        null_count = col_info.get("null_count", 0)
        null_ratio = col_info.get("null_ratio", 0)
        dtype = col_info.get("dtype", "")

        if null_count > 0:
            # Determine severity
            if null_ratio > 0.3:
                severity = "high"
            elif null_ratio > 0.1:
                severity = "medium"
            else:
                severity = "low"

            # Determine strategies based on data type
            if "int" in dtype.lower() or "float" in dtype.lower():
                strategy = "fill_mean"
                strategy_options = ["fill_mean", "fill_median", "drop_rows"]
                description = f"Fill {null_count} missing values in '{col_name}' with column mean"
            else:
                strategy = "drop_rows"
                strategy_options = ["drop_rows", "fill_mode"]
                description = f"Drop {null_count} rows with missing '{col_name}' values"

            recommendations.append({
                "id": str(uuid4())[:8],
                "issue_type": "missing_values",
                "column": col_name,
                "severity": severity,
                "strategy": strategy,
                "strategy_options": strategy_options,
                "description": description,
                "impact": f"Affects {round(null_ratio * 100, 1)}% of rows ({null_count} values)",
            })

    # --- Outlier Recommendations ---
    numeric_columns = anomalies.get("numeric_columns", {})

    for col_name, col_info in numeric_columns.items():
        outlier_count = col_info.get("outlier_count", 0)

        if outlier_count > 0:
            outlier_ratio = outlier_count / row_count if row_count > 0 else 0

            # Determine severity
            if outlier_ratio > 0.05:
                severity = "high"
            elif outlier_ratio > 0.02:
                severity = "medium"
            else:
                severity = "low"

            recommendations.append({
                "id": str(uuid4())[:8],
                "issue_type": "outliers",
                "column": col_name,
                "severity": severity,
                "strategy": "cap_outliers",
                "strategy_options": ["cap_outliers", "remove_outliers", "ignore"],
                "description": f"Cap {outlier_count} outliers in '{col_name}' using IQR bounds",
                "impact": f"Affects {round(outlier_ratio * 100, 1)}% of rows ({outlier_count} values)",
            })

    # --- Duplicate Recommendations ---
    duplicate_count = duplicates.get("duplicate_count", 0)
    duplicate_percentage = duplicates.get("duplicate_percentage", 0)

    if duplicate_count > 0:
        # Determine severity
        if duplicate_percentage > 10:
            severity = "high"
        elif duplicate_percentage > 5:
            severity = "medium"
        else:
            severity = "low"

        recommendations.append({
            "id": str(uuid4())[:8],
            "issue_type": "duplicates",
            "column": None,  # Affects entire row
            "severity": severity,
            "strategy": "remove_duplicates",
            "strategy_options": ["remove_duplicates", "keep_last", "ignore"],
            "description": f"Remove {duplicate_count} duplicate rows (keep first occurrence)",
            "impact": f"Affects {round(duplicate_percentage, 1)}% of rows ({duplicate_count} rows)",
        })

    # Sort by severity (high first)
    severity_order = {"high": 0, "medium": 1, "low": 2}
    recommendations.sort(key=lambda x: severity_order.get(x["severity"], 3))

    return recommendations


def build_cleaning_actions_from_recommendations(
    recommendations: List[Dict[str, Any]],
    selected_ids: List[str],
) -> Dict[str, Any]:
    """
    Convert selected recommendations to cleaning plan actions.

    Args:
        recommendations: Full list of recommendations
        selected_ids: IDs of recommendations user wants to apply

    Returns:
        proposed_actions dict for CleaningPlan
    """
    actions: Dict[str, Any] = {
        "fill_missing": [],
        "drop_rows": [],
        "remove_duplicates": False,
        "cap_outliers": [],
        "remove_outliers": [],
    }

    selected_recs = [r for r in recommendations if r["id"] in selected_ids]

    for rec in selected_recs:
        issue_type = rec["issue_type"]
        strategy = rec["strategy"]
        column = rec.get("column")

        if issue_type == "missing_values":
            if strategy == "fill_mean":
                actions["fill_missing"].append({"column": column, "method": "mean"})
            elif strategy == "fill_median":
                actions["fill_missing"].append({"column": column, "method": "median"})
            elif strategy == "drop_rows":
                actions["drop_rows"].append(column)

        elif issue_type == "duplicates":
            if strategy == "remove_duplicates":
                actions["remove_duplicates"] = True

        elif issue_type == "outliers":
            if strategy == "cap_outliers":
                actions["cap_outliers"].append(column)
            elif strategy == "remove_outliers":
                actions["remove_outliers"].append(column)

    return actions
