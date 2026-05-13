"""
Role Resolver - Utility for resolving semantic roles to actual column names.

This utility decouples the analytics engines from the raw column names.
Instead of searching for 'revenue', the engine asks for the 'revenue' role
from the confirmed SemanticMap.
"""

import json
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)

def resolve_column_by_role(
    role: str,
    semantic_map_json: Optional[str]
) -> Optional[str]:
    """
    Resolves a semantic role (e.g., 'revenue') to an actual column name
    using the confirmed semantic map.
    """
    if not semantic_map_json:
        logger.warning(f"Attempted to resolve role '{role}' but no semantic map is present.")
        return None

    try:
        s_map = json.loads(semantic_map_json)
        # The map is stored as { "role": "column_name" }
        return s_map.get(role)
    except json.JSONDecodeError:
        logger.error("Failed to parse semantic_map_json during role resolution.")
        return None

def get_all_resolved_roles(semantic_map_json: Optional[str]) -> Dict[str, str]:
    """
    Returns the full map of roles to columns.
    """
    if not semantic_map_json:
        return {}
    try:
        return json.loads(semantic_map_json)
    except json.JSONDecodeError:
        return {}
