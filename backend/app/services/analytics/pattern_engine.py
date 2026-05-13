"""
Pattern Engine - Identifies universal analysis patterns based on semantic roles.

Instead of domain-specific logic (e.g., 'if domain == SALES'), this engine
identifies structural patterns in the data (e.g., 'has date and metric').
"""

from typing import List, Dict, Set, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

@dataclass
class AnalysisPattern:
    id: str
    name: str
    required_roles: Set[str]
    description: str

class PatternEngine:
    # Universal Analysis Patterns
    PATTERNS = {
        "temporal_trend": AnalysisPattern(
            id="temporal_trend",
            name="Temporal Trend",
            required_roles={"date", "revenue"}, # Base metric is revenue, but we'll generalize
            description="Analyze how a metric changes over time."
        ),
        "composition": AnalysisPattern(
            id="composition",
            name="Composition",
            required_roles={"category", "revenue"},
            description="Analyze the breakdown of a metric across categories."
        ),
        "correlation": AnalysisPattern(
            id="correlation",
            name="Correlation",
            required_roles={"revenue", "cost"},
            description="Analyze the relationship between two metrics."
        ),
        "target_analysis": AnalysisPattern(
            id="target_analysis",
            name="Target Analysis",
            required_roles={"target", "category"},
            description="Analyze target outcomes across different segments."
        ),
        "geographic_distribution": AnalysisPattern(
            id="geographic_distribution",
            name="Geographic Distribution",
            required_roles={"region", "revenue"},
            description="Analyze metric distribution across geographic areas."
        ),
    }

    def identify_active_patterns(self, semantic_map: Dict[str, str]) -> List[AnalysisPattern]:
        """
        Given a confirmed semantic map, identify which universal patterns can be executed.
        """
        active_roles = set(semantic_map.keys())
        active_patterns = []

        # Generalize: 'revenue' role in PATTERNS actually means 'any valid metric'
        # 'category' means 'any valid dimension'

        # We'll refine the required_roles check to be more flexible
        for p_id, pattern in self.PATTERNS.items():
            if self._pattern_is_satisfied(pattern, active_roles):
                active_patterns.append(pattern)

        return active_patterns

    def _pattern_is_satisfied(self, pattern: AnalysisPattern, active_roles: Set[str]) -> bool:
        """
        Checks if the requirements for a pattern are met.
        Generalizes specific roles to categories (e.g., 'revenue' -> any metric).
        """
        # Define role groups
        METRICS = {"revenue", "cost", "amount", "profit", "quantity"}
        DIMENSIONS = {"category", "region", "identifier"}
        TEMPORAL = {"date"}
        TARGETS = {"target"}

        required = pattern.required_roles

        # Check if we have at least one from each required group
        # This is a simplified version; in production we'd use a more formal group mapping.

        # If pattern requires 'date', we must have a 'date' role
        if "date" in required and not (active_roles & TEMPORAL):
            return False

        # If pattern requires 'revenue' (meaning any metric), we must have at least one metric
        if "revenue" in required and not (active_roles & METRICS):
            return False

        # If pattern requires 'category' (meaning any dimension), we must have at least one dimension
        if "category" in required and not (active_roles & DIMENSIONS):
            return False

        # If pattern requires 'target', we must have a 'target' role
        if "target" in required and not (active_roles & TARGETS):
            return False

        # If pattern requires 'region', we must have 'region' (specifically)
        if "region" in required and "region" not in active_roles:
            return False

        return True
