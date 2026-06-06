"""
Role Resolver - Utility for resolving semantic roles to actual column names.

This utility decouples the analytics engines from the raw column names.
Instead of searching for 'revenue', the engine asks for the 'revenue' role
from the confirmed SemanticMap.

Supports two storage formats with auto-detection:
- Legacy: {role: column}  e.g. {"revenue": "Sales"}
- New:    {column: role}   e.g. {"Sales": "revenue", "Cost": "cost"}
"""

import json
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

# Canonical role names — used to detect map format
_KNOWN_ROLES = {
    "date", "datetime", "year_month", "fiscal_period",
    "category", "sub_category", "geography", "entity_id", "boolean_flag",
    "revenue", "cost", "quantity", "count", "ratio_pct", "score", "duration_seconds",
    "primary_key", "foreign_key", "name_label",
    "unclassified",
}


def detect_map_format(raw_map: Dict[str, str]) -> str:
    """
    Detect whether a semantic map is stored as:
      - "role_to_col": keys are roles, values are columns  (legacy)
      - "col_to_role": keys are columns, values are roles   (new)

    Heuristic: if >50% of keys match known role names → legacy format.
    """
    if not raw_map:
        return "col_to_role"

    keys = set(raw_map.keys())
    values = set(raw_map.values())

    keys_are_roles = len(keys & _KNOWN_ROLES) / len(keys) if keys else 0
    values_are_roles = len(values & _KNOWN_ROLES) / len(values) if values else 0

    if keys_are_roles > values_are_roles:
        return "role_to_col"
    return "col_to_role"


def normalize_to_col_role(semantic_map_json: Optional[str]) -> Dict[str, str]:
    """
    Parse semantic_map_json and return canonical {column: role} dict.
    Handles both legacy {role: column} and new {column: role} formats.
    """
    if not semantic_map_json:
        return {}
    try:
        raw = json.loads(semantic_map_json)
    except json.JSONDecodeError:
        logger.error("Failed to parse semantic_map_json")
        return {}

    fmt = detect_map_format(raw)
    if fmt == "role_to_col":
        # Invert: {role: column} → {column: role}
        return {col: role for role, col in raw.items()}
    return dict(raw)


def normalize_to_role_columns(semantic_map_json: Optional[str]) -> Dict[str, List[str]]:
    """
    Parse semantic_map_json and return {role: [column1, column2, ...]} dict.
    Supports multiple columns per role (the main fix for missing columns).
    """
    col_role = normalize_to_col_role(semantic_map_json)
    result: Dict[str, List[str]] = {}
    for col, role in col_role.items():
        result.setdefault(role, []).append(col)
    return result


def invert_to_role_map(semantic_map_json: Optional[str]) -> Dict[str, str]:
    """
    Return legacy-compatible {role: column} dict.
    If multiple columns share a role, returns the first one encountered.
    Used by consumers that still expect single-column-per-role.
    """
    col_role = normalize_to_col_role(semantic_map_json)
    result: Dict[str, str] = {}
    for col, role in col_role.items():
        if role not in result:
            result[role] = col
    return result


def resolve_column_by_role(
    role: str,
    semantic_map_json: Optional[str]
) -> Optional[str]:
    """
    Resolves a semantic role (e.g., 'revenue') to an actual column name
    using the confirmed semantic map.
    Handles both legacy and new formats.
    """
    if not semantic_map_json:
        logger.warning(f"Attempted to resolve role '{role}' but no semantic map is present.")
        return None

    role_map = invert_to_role_map(semantic_map_json)
    return role_map.get(role)


def resolve_columns_by_role(
    role: str,
    semantic_map_json: Optional[str]
) -> List[str]:
    """
    Resolves a semantic role to ALL matching column names.
    Returns empty list if no match found.
    """
    if not semantic_map_json:
        return []

    role_cols = normalize_to_role_columns(semantic_map_json)
    return role_cols.get(role, [])


def get_all_resolved_roles(semantic_map_json: Optional[str]) -> Dict[str, str]:
    """
    Returns the full map of roles to first-matched columns (legacy compat).
    """
    return invert_to_role_map(semantic_map_json)
