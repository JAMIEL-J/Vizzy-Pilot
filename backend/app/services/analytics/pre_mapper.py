"""
PreMapper - Deterministic role assignment for obvious patterns.
Prevents LLM failures for textbook cases (IDs, Dates, Binary flags).
"""
from typing import Dict, Any, Optional
from app.services.analytics.data_profiler import ColumnProfile

class PreMapper:
    def __init__(self):
        self.id_keywords = {'id', 'uuid', 'guid', 'pk', 'customerid', 'orderid', 'transactionid'}
        self.date_keywords = {'date', 'time', 'timestamp', 'created', 'updated'}
        self.binary_keywords = {'is_', 'has_', 'active', 'churn', 'success', 'fail'}

    def suggest_role(self, name: str, profile: ColumnProfile) -> Optional[str]:
        name_clean = name.lower().replace('_', '').replace(' ', '')

        # 1. Absolute Identifier
        if any(kw in name_clean for kw in self.id_keywords) and profile.is_identifier:
            return "identifier"

        # 2. Absolute Date
        if any(kw in name_clean for kw in self.date_keywords) and profile.is_datetime:
            return "date"

        # 3. Absolute Binary/Target
        if any(kw in name_clean for kw in self.binary_keywords) and profile.is_binary:
            return "target"

        return None

    def pre_map_dataset(self, profiles: Dict[str, ColumnProfile]) -> Dict[str, Dict[str, Any]]:
        """
        Returns a map of {column: {role, evidence, confidence}} for deterministic matches.
        """
        pre_mappings = {}
        for col, prof in profiles.items():
            role = self.suggest_role(col, prof)
            if role:
                pre_mappings[col] = {
                    "role": role,
                    "evidence": f"Deterministically identified as {role} based on name and profile patterns.",
                    "confidence": 1.0
                }
        return pre_mappings
