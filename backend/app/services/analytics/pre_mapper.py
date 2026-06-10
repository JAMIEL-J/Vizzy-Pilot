"""
PreMapper - Deterministic role assignment for obvious patterns.
Prevents LLM failures for textbook cases and fixes NaT misclassification.
"""
from typing import Dict, Any, Optional, Set
import re
from app.services.analytics.data_profiler import ColumnProfile


class PreMapper:
    """
    Stage 1: Deterministic role assignment.
    Runs BEFORE the LLM. High-confidence patterns bypass LLM entirely.
    Uses token-based matching (not substring) to avoid false positives
    like 'age' matching 'percentage' or 'coverage'.
    """

    # ---- Keyword groups (lowercased) ----
    ID_KEYWORDS = {'id', 'uuid', 'guid', 'pk', 'customerid', 'orderid', 'transactionid', 'employeeid', 'userid'}
    DATE_KEYWORDS = {'date', 'time', 'timestamp', 'created', 'updated', 'createdat', 'updatedat', 'orderdate', 'shipdate'}
    BINARY_KEYWORDS = {'is', 'has', 'active', 'churn', 'success', 'fail', 'flag', 'status'}
    REVENUE_KEYWORDS = {'revenue', 'sales', 'amount', 'income', 'turnover', 'totalsales', 'salesperorder', 'totalamount'}
    COST_KEYWORDS = {'cost', 'expense', 'spend', 'cogs', 'spending', 'outflow'}
    PROFIT_KEYWORDS = {'profit', 'margin', 'earnings', 'netprofit', 'grossprofit', 'netincome'}
    QUANTITY_KEYWORDS = {'quantity', 'units', 'qty', 'volume', 'unitssold', 'orderquantity', 'itemcount'}
    GEOGRAPHY_KEYWORDS = {'country', 'state', 'city', 'region', 'territory', 'market', 'geo', 'geography', 'location', 'province', 'district'}
    CATEGORY_KEYWORDS = {'category', 'segment', 'department', 'type', 'class', 'group', 'subcategory', 'productline'}
    NAME_KEYWORDS = {'name', 'label', 'title', 'description', 'productname', 'customername', 'employeename'}
    TENURE_KEYWORDS = {'tenure', 'experience', 'age', 'seniority', 'lengthof', 'yearsin', 'monthsin', 'yearsofservice', 'employmentyears'}

    # Guard: these words in a column name + is_numeric + NOT is_datetime → force "tenure", BLOCK "date"
    TENURE_GUARD_WORDS = {'tenure', 'experience', 'age', 'seniority', 'months', 'years', 'lengthof'}

    @staticmethod
    def _tokenize(name: str) -> Set[str]:
        """Split column name into word tokens for boundary-safe matching.
        'Sales_Per_Order' → {'sales', 'per', 'order'}
        'TotalAmount'     → {'totalamount'} (camelCase stays joined after lowering)
        """
        return set(re.split(r'[_\s\-]+', name.lower()))

    @staticmethod
    def _matches(tokens: Set[str], keywords: Set[str]) -> bool:
        """Check if any token matches any keyword (exact token match, not substring)."""
        return bool(tokens & keywords)

    @staticmethod
    def _matches_compound(name_clean: str, keywords: Set[str]) -> bool:
        """Fallback: check if the full cleaned name (no separators) matches a compound keyword.
        Catches 'salesperorder' matching 'salesperorder' in the keyword set.
        """
        return name_clean in keywords

    def suggest_role(self, name: str, profile: ColumnProfile) -> Optional[str]:
        tokens = self._tokenize(name)
        name_clean = name.lower().replace('_', '').replace(' ', '').replace('-', '')

        def hit(keywords: Set[str]) -> bool:
            return self._matches(tokens, keywords) or self._matches_compound(name_clean, keywords)

        # ─── TENURE GUARD (must run BEFORE date check) ───
        # Prevents NaT misclassification: numeric columns with temporal-adjacent names
        if profile.is_numeric and not profile.is_datetime:
            if hit(self.TENURE_GUARD_WORDS):
                return "tenure"

        # ─── Identifiers ───
        if hit(self.ID_KEYWORDS) and profile.is_identifier:
            return "primary_key"

        # ─── Dates ───
        if hit(self.DATE_KEYWORDS) and profile.is_datetime:
            return "date"

        # ─── Binary/Target ───
        if hit(self.BINARY_KEYWORDS) and profile.is_binary:
            return "target"

        # ─── Revenue (currency pattern required) ───
        if hit(self.REVENUE_KEYWORDS) and profile.is_numeric and profile.is_currency_pattern:
            return "revenue"

        # ─── Cost ───
        if hit(self.COST_KEYWORDS) and profile.is_numeric:
            return "cost"

        # ─── Profit ───
        if hit(self.PROFIT_KEYWORDS) and profile.is_numeric:
            return "profit"

        # ─── Quantity (numeric but NOT currency) ───
        if hit(self.QUANTITY_KEYWORDS) and profile.is_numeric and not profile.is_currency_pattern:
            return "quantity"

        # ─── Geography ───
        if hit(self.GEOGRAPHY_KEYWORDS) and profile.is_categorical:
            return "geography"

        # ─── Category ───
        if hit(self.CATEGORY_KEYWORDS) and profile.is_categorical:
            return "category"

        # ─── Name/Label ───
        if hit(self.NAME_KEYWORDS) and not profile.is_identifier:
            return "name_label"

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
                    "evidence": f"Deterministically identified as {role} based on name pattern and data profile.",
                    "confidence": 1.0
                }
        return pre_mappings
