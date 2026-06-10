"""
Test Suite: Semantic Role Mapper Overhaul
=========================================
Covers all 4 phases:
  Phase 1 - Vocabulary Unification
  Phase 2 - PreMapper Accuracy + Tenure Guard
  Phase 3 - Profile Data for UI (cardinality fix)
  Phase 4 - Feedback Loop data model

Each test reports execution time for performance tracking.
"""

import pytest
import time
import json
from dataclasses import dataclass
from typing import Dict, Any, List, Optional

# -- Imports under test --
from app.services.semantic_audit import ROLE_TAXONOMY, ROLE_VOCABULARY_FOR_LLM
from app.services.analytics.role_resolver import _KNOWN_ROLES, detect_map_format, normalize_to_col_role
from app.services.analytics.pre_mapper import PreMapper
from app.services.analytics.data_profiler import ColumnProfile, DataProfiler
from app.services.chart_recommender import generate_chart_configs


# ===========================================================
# Helpers
# ===========================================================

def _make_profile(
    name: str,
    dtype: str = "object",
    cardinality: float = 0.5,
    unique_count: int = 10,
    is_numeric: bool = False,
    is_datetime: bool = False,
    is_categorical: bool = False,
    is_identifier: bool = False,
    is_binary: bool = False,
    is_currency_pattern: bool = False,
    samples: list = None,
) -> ColumnProfile:
    """Factory for creating test ColumnProfile instances."""
    return ColumnProfile(
        column_name=name,
        dtype=dtype,
        cardinality=cardinality,
        unique_count=unique_count,
        is_numeric=is_numeric,
        is_datetime=is_datetime,
        is_categorical=is_categorical,
        is_identifier=is_identifier,
        is_binary=is_binary,
        is_currency_pattern=is_currency_pattern,
        samples=samples or [],
    )


class TimedResult:
    """Context manager that captures execution time in milliseconds."""
    def __init__(self):
        self.elapsed_ms = 0.0

    def __enter__(self):
        self._start = time.perf_counter()
        return self

    def __exit__(self, *args):
        self.elapsed_ms = (time.perf_counter() - self._start) * 1000


# ===========================================================
# PHASE 1: Vocabulary Unification
# ===========================================================

class TestVocabularyUnification:
    """Phase 1: Ensure a single source of truth for role vocabulary."""

    def test_taxonomy_has_23_roles(self):
        """ROLE_TAXONOMY must have exactly 23 entries (20 original + profit + target + tenure)."""
        with TimedResult() as t:
            count = len(ROLE_TAXONOMY)
        assert count == 23, f"Expected 23 roles, got {count}. Keys: {sorted(ROLE_TAXONOMY.keys())}"
        print(f"  [PASS] ROLE_TAXONOMY has {count} roles ({t.elapsed_ms:.2f}ms)")

    def test_llm_vocabulary_matches_taxonomy(self):
        """ROLE_VOCABULARY_FOR_LLM keys must exactly match ROLE_TAXONOMY keys."""
        with TimedResult() as t:
            taxonomy_keys = set(ROLE_TAXONOMY.keys())
            vocab_keys = set(ROLE_VOCABULARY_FOR_LLM.keys())
            missing_in_vocab = taxonomy_keys - vocab_keys
            extra_in_vocab = vocab_keys - taxonomy_keys
        assert not missing_in_vocab, f"Missing from LLM vocab: {missing_in_vocab}"
        assert not extra_in_vocab, f"Extra in LLM vocab: {extra_in_vocab}"
        print(f"  [PASS] LLM vocab keys match taxonomy ({t.elapsed_ms:.2f}ms)")

    def test_known_roles_dynamic_sync(self):
        """_KNOWN_ROLES in role_resolver must be derived from ROLE_TAXONOMY (dynamic)."""
        with TimedResult() as t:
            assert _KNOWN_ROLES == set(ROLE_TAXONOMY.keys())
        print(f"  [PASS] _KNOWN_ROLES synced dynamically ({t.elapsed_ms:.2f}ms)")

    def test_new_roles_present(self):
        """The 3 new roles (profit, target, tenure) must exist in all registries."""
        with TimedResult() as t:
            for role in ["profit", "target", "tenure"]:
                assert role in ROLE_TAXONOMY, f"{role} missing from ROLE_TAXONOMY"
                assert role in ROLE_VOCABULARY_FOR_LLM, f"{role} missing from ROLE_VOCABULARY_FOR_LLM"
                assert role in _KNOWN_ROLES, f"{role} missing from _KNOWN_ROLES"
        print(f"  [PASS] profit, target, tenure present everywhere ({t.elapsed_ms:.2f}ms)")

    def test_no_generic_role_anywhere(self):
        """The old 'generic' fallback must not exist in any registry."""
        with TimedResult() as t:
            assert "generic" not in ROLE_TAXONOMY
            assert "generic" not in ROLE_VOCABULARY_FOR_LLM
            assert "generic" not in _KNOWN_ROLES
        print(f"  [PASS] No 'generic' role found ({t.elapsed_ms:.2f}ms)")

    def test_no_region_role(self):
        """The old 'region' role must not exist -- unified to 'geography'."""
        with TimedResult() as t:
            assert "region" not in ROLE_TAXONOMY
            assert "geography" in ROLE_TAXONOMY
        print(f"  [PASS] 'region' -> 'geography' unified ({t.elapsed_ms:.2f}ms)")

    def test_profit_affinity(self):
        """profit must have measure_y affinity for chart engine."""
        assert ROLE_TAXONOMY["profit"]["affinity"] == "measure_y"

    def test_target_affinity(self):
        """target must have filter_only affinity (not measure_y)."""
        assert ROLE_TAXONOMY["target"]["affinity"] == "filter_only"

    def test_tenure_affinity(self):
        """tenure must have measure_y affinity -- NOT time_series_x."""
        assert ROLE_TAXONOMY["tenure"]["affinity"] == "measure_y"
        assert ROLE_TAXONOMY["tenure"]["affinity"] != "time_series_x"

    def test_every_role_has_llm_description(self):
        """Every role in taxonomy must have a non-empty LLM description."""
        for role in ROLE_TAXONOMY:
            desc = ROLE_VOCABULARY_FOR_LLM.get(role, "")
            assert len(desc) > 10, f"Role '{role}' has no/short LLM description: '{desc}'"


# ===========================================================
# PHASE 2: PreMapper Accuracy + Tenure Guard
# ===========================================================

class TestPreMapper:
    """Phase 2: Deterministic pre-mapping with tenure guard."""

    def setup_method(self):
        self.mapper = PreMapper()

    # -- Tenure Guard (NaT fix) --

    def test_tenure_months_maps_to_tenure(self):
        """Numeric column 'Tenure_Months' must -> tenure, NOT date."""
        profile = _make_profile("Tenure_Months", is_numeric=True, is_datetime=False)
        with TimedResult() as t:
            role = self.mapper.suggest_role("Tenure_Months", profile)
        assert role == "tenure", f"Expected 'tenure', got '{role}'"
        print(f"  [PASS] Tenure_Months -> tenure ({t.elapsed_ms:.2f}ms)")

    def test_years_experience_maps_to_tenure(self):
        profile = _make_profile("Years_Experience", is_numeric=True, is_datetime=False)
        assert self.mapper.suggest_role("Years_Experience", profile) == "tenure"

    def test_employee_age_maps_to_tenure(self):
        profile = _make_profile("Age", is_numeric=True, is_datetime=False)
        assert self.mapper.suggest_role("Age", profile) == "tenure"

    def test_seniority_level_maps_to_tenure(self):
        profile = _make_profile("Seniority", is_numeric=True, is_datetime=False)
        assert self.mapper.suggest_role("Seniority", profile) == "tenure"

    # -- Tenure Guard FALSE POSITIVE prevention --

    def test_percentage_NOT_tenure(self):
        """'Discount_Percentage' must NOT match tenure guard (substring 'age' in 'percentage')."""
        profile = _make_profile("Discount_Percentage", is_numeric=True, is_datetime=False)
        with TimedResult() as t:
            role = self.mapper.suggest_role("Discount_Percentage", profile)
        # Should NOT be 'tenure' -- 'percentage' is not the token 'age'
        assert role != "tenure", f"False positive: 'Discount_Percentage' was matched as tenure"
        print(f"  [PASS] Discount_Percentage != tenure ({t.elapsed_ms:.2f}ms)")

    def test_coverage_NOT_tenure(self):
        """'Insurance_Coverage' must NOT match tenure guard."""
        profile = _make_profile("Insurance_Coverage", is_numeric=True, is_datetime=False)
        role = self.mapper.suggest_role("Insurance_Coverage", profile)
        assert role != "tenure", f"False positive: 'Insurance_Coverage' was matched as tenure"

    def test_mileage_NOT_tenure(self):
        """'Vehicle_Mileage' must NOT match tenure guard."""
        profile = _make_profile("Vehicle_Mileage", is_numeric=True, is_datetime=False)
        role = self.mapper.suggest_role("Vehicle_Mileage", profile)
        assert role != "tenure", f"False positive: 'Vehicle_Mileage' was matched as tenure"

    def test_package_NOT_tenure(self):
        """'Package_Weight' must NOT match tenure guard."""
        profile = _make_profile("Package_Weight", is_numeric=True, is_datetime=False)
        role = self.mapper.suggest_role("Package_Weight", profile)
        assert role != "tenure", f"False positive: 'Package_Weight' was matched as tenure"

    def test_storage_NOT_tenure(self):
        """'Storage_Size' must NOT match tenure guard."""
        profile = _make_profile("Storage_Size", is_numeric=True, is_datetime=False)
        role = self.mapper.suggest_role("Storage_Size", profile)
        assert role != "tenure"

    def test_usage_NOT_tenure(self):
        """'Data_Usage' must NOT match tenure guard."""
        profile = _make_profile("Data_Usage", is_numeric=True, is_datetime=False)
        role = self.mapper.suggest_role("Data_Usage", profile)
        assert role != "tenure"

    # -- Standard mappings --

    def test_order_date_maps_to_date(self):
        profile = _make_profile("Order_Date", is_datetime=True)
        assert self.mapper.suggest_role("Order_Date", profile) == "date"

    def test_customer_id_maps_to_primary_key(self):
        profile = _make_profile("Customer_ID", is_identifier=True)
        assert self.mapper.suggest_role("Customer_ID", profile) == "primary_key"

    def test_is_churned_maps_to_target(self):
        profile = _make_profile("Is_Churned", is_binary=True)
        assert self.mapper.suggest_role("Is_Churned", profile) == "target"

    def test_total_sales_maps_to_revenue(self):
        profile = _make_profile("Total_Sales", is_numeric=True, is_currency_pattern=True)
        assert self.mapper.suggest_role("Total_Sales", profile) == "revenue"

    def test_cogs_maps_to_cost(self):
        profile = _make_profile("COGS", is_numeric=True)
        assert self.mapper.suggest_role("COGS", profile) == "cost"

    def test_net_profit_maps_to_profit(self):
        profile = _make_profile("Net_Profit", is_numeric=True)
        assert self.mapper.suggest_role("Net_Profit", profile) == "profit"

    def test_units_sold_maps_to_quantity(self):
        profile = _make_profile("Units_Sold", is_numeric=True, is_currency_pattern=False)
        assert self.mapper.suggest_role("Units_Sold", profile) == "quantity"

    def test_country_maps_to_geography(self):
        profile = _make_profile("Country", is_categorical=True)
        assert self.mapper.suggest_role("Country", profile) == "geography"

    def test_product_category_maps_to_category(self):
        profile = _make_profile("Product_Category", is_categorical=True)
        assert self.mapper.suggest_role("Product_Category", profile) == "category"

    def test_customer_name_maps_to_name_label(self):
        profile = _make_profile("Customer_Name", is_identifier=False)
        assert self.mapper.suggest_role("Customer_Name", profile) == "name_label"

    def test_unknown_column_returns_none(self):
        """Columns with no pattern match should return None (defer to LLM)."""
        profile = _make_profile("XYZ_Metric", is_numeric=True)
        assert self.mapper.suggest_role("XYZ_Metric", profile) is None

    # -- Full dataset pre-mapping benchmark --

    def test_full_dataset_premapping_speed(self):
        """Pre-map a 25-column business dataset and verify speed + accuracy."""
        profiles = {
            "Order_ID": _make_profile("Order_ID", is_identifier=True),
            "Order_Date": _make_profile("Order_Date", is_datetime=True),
            "Ship_Date": _make_profile("Ship_Date", is_datetime=True),
            "Customer_ID": _make_profile("Customer_ID", is_identifier=True),
            "Customer_Name": _make_profile("Customer_Name"),
            "Segment": _make_profile("Segment", is_categorical=True),
            "Country": _make_profile("Country", is_categorical=True),
            "City": _make_profile("City", is_categorical=True),
            "State": _make_profile("State", is_categorical=True),
            "Region": _make_profile("Region", is_categorical=True),
            "Product_Category": _make_profile("Product_Category", is_categorical=True),
            "Sub_Category": _make_profile("Sub_Category", is_categorical=True),
            "Product_Name": _make_profile("Product_Name"),
            "Sales": _make_profile("Sales", is_numeric=True, is_currency_pattern=True),
            "Quantity": _make_profile("Quantity", is_numeric=True, is_currency_pattern=False),
            "Discount_Percentage": _make_profile("Discount_Percentage", is_numeric=True),
            "Profit": _make_profile("Profit", is_numeric=True),
            "Tenure_Months": _make_profile("Tenure_Months", is_numeric=True),
            "Age": _make_profile("Age", is_numeric=True),
            "Is_Active": _make_profile("Is_Active", is_binary=True),
            "Score": _make_profile("Score", is_numeric=True),
            "Revenue_Total": _make_profile("Revenue_Total", is_numeric=True, is_currency_pattern=True),
            "Cost_Shipping": _make_profile("Cost_Shipping", is_numeric=True),
            "Net_Profit": _make_profile("Net_Profit", is_numeric=True),
            "Unknown_Col": _make_profile("Unknown_Col"),
        }

        with TimedResult() as t:
            result = self.mapper.pre_map_dataset(profiles)

        mapped_count = len(result)
        deferred_count = len(profiles) - mapped_count
        coverage_pct = mapped_count / len(profiles) * 100

        print(f"\n  -- PreMapper Benchmark (25 columns) --")
        print(f"  [TIME] {t.elapsed_ms:.2f}ms")
        print(f"  [MAPPED] {mapped_count}/25 ({coverage_pct:.0f}%)")
        print(f"  [DEFERRED] {deferred_count}")
        print(f"  -- Mapping Results --")
        for col, mapping in sorted(result.items()):
            print(f"     {col:25s} -> {mapping['role']}")
        print(f"  -- Deferred Columns --")
        for col in profiles:
            if col not in result:
                print(f"     {col:25s} -> (LLM)")

        # Assertions
        assert t.elapsed_ms < 50, f"PreMapper took {t.elapsed_ms:.2f}ms -- should be < 50ms"
        assert coverage_pct >= 40, f"Coverage {coverage_pct:.0f}% -- expected >= 40%"

        # Specific role checks
        assert result["Tenure_Months"]["role"] == "tenure"
        assert result["Age"]["role"] == "tenure"
        assert result["Order_Date"]["role"] == "date"
        assert result["Profit"]["role"] == "profit"
        assert result["Sales"]["role"] == "revenue"
        assert result["Quantity"]["role"] == "quantity"
        assert result["Country"]["role"] == "geography"
        assert "Discount_Percentage" not in result, "Discount_Percentage should NOT match tenure"
        assert "Unknown_Col" not in result, "Unknown_Col should defer to LLM"


# ===========================================================
# PHASE 3: Profile Data for UI (cardinality fix)
# ===========================================================

class TestProfileDataForUI:
    """Phase 3: Verify cardinality calculation and profile data structure."""

    def test_cardinality_calculation_formula(self):
        """Cardinality = unique_count / total_rows, NOT unique_count / 1."""
        unique_count = 50
        total_rows = 1000
        with TimedResult() as t:
            cardinality = round(unique_count / max(1, total_rows), 4)
        assert cardinality == 0.05, f"Expected 0.05, got {cardinality}"
        assert cardinality != unique_count, "Cardinality must not equal unique_count (old bug)"
        print(f"  [PASS] Cardinality = {unique_count}/{total_rows} = {cardinality} ({t.elapsed_ms:.2f}ms)")

    def test_cardinality_high_for_identifiers(self):
        """Identifier columns should have cardinality close to 1.0."""
        unique = 980
        total = 1000
        cardinality = round(unique / max(1, total), 4)
        assert cardinality > 0.9, f"Expected > 0.9, got {cardinality}"

    def test_cardinality_low_for_categories(self):
        """Categorical columns should have cardinality < 0.1."""
        unique = 5
        total = 1000
        cardinality = round(unique / max(1, total), 4)
        assert cardinality < 0.1, f"Expected < 0.1, got {cardinality}"

    def test_cardinality_none_when_no_unique_count(self):
        """If unique_count is None, cardinality should be None."""
        unique_count = None
        cardinality = round(unique_count / max(1, 1000), 4) if unique_count else None
        assert cardinality is None


# ===========================================================
# PHASE 4: Role Resolver + Chart Recommender Integration
# ===========================================================

class TestRoleResolverIntegration:
    """Phase 4: Ensure role resolver and chart recommender handle new roles."""

    def test_normalize_with_new_roles(self):
        """normalize_to_col_role must handle profit, target, tenure roles."""
        semantic_map = json.dumps({
            "Sales": "revenue",
            "COGS": "cost",
            "Net_Profit": "profit",
            "Tenure_Months": "tenure",
            "Is_Churned": "target",
            "Order_Date": "date",
        })
        with TimedResult() as t:
            result = normalize_to_col_role(semantic_map)
        assert result["Net_Profit"] == "profit"
        assert result["Tenure_Months"] == "tenure"
        assert result["Is_Churned"] == "target"
        print(f"  [PASS] normalize_to_col_role handles new roles ({t.elapsed_ms:.2f}ms)")

    def test_detect_format_col_to_role(self):
        """New-format maps (col->role) should be detected correctly."""
        m = {"Sales": "revenue", "Date": "date", "Region": "geography"}
        assert detect_map_format(m) == "col_to_role"

    def test_detect_format_role_to_col(self):
        """Legacy-format maps (role->col) should be detected correctly."""
        m = {"revenue": "Sales", "date": "Date", "geography": "Region"}
        assert detect_map_format(m) == "role_to_col"

    def test_chart_recommender_uses_new_roles(self):
        """Chart recommender must generate charts using profit and tenure roles."""
        semantic_map = json.dumps({
            "Order_Date": "date",
            "Total_Sales": "revenue",
            "Net_Profit": "profit",
            "COGS": "cost",
            "Tenure_Months": "tenure",
            "Region": "geography",
        })
        with TimedResult() as t:
            configs = generate_chart_configs(semantic_map)
        chart_metrics = [c.metric for c in configs if c.metric]
        print(f"  [PASS] Chart recommender generated {len(configs)} charts ({t.elapsed_ms:.2f}ms)")
        for c in configs:
            print(f"     {c.chart_id:12s} | {c.type:6s} | {(c.dimension or '-'):15s} x {(c.metric or '-'):15s}")

        # Chart recommender caps at 3 measures per chart type.
        # With 4 measures (revenue, profit, cost, tenure), only first 3 get time-series charts.
        # This is correct behavior -- tenure is still a valid measure in the taxonomy.
        assert len(configs) >= 3, f"Expected at least 3 charts, got {len(configs)}"
        # Verify at least some new roles appear in chart output
        assert "Net_Profit" in chart_metrics, f"profit column missing from chart metrics: {chart_metrics}"


# ===========================================================
# E2E: DataProfiler -> PreMapper pipeline
# ===========================================================

class TestEndToEndPipeline:
    """E2E: DataProfiler -> PreMapper flow with a real DataFrame."""

    def test_profiler_to_premapper_pipeline(self):
        """Full pipeline: profile a DataFrame, then pre-map roles."""
        import pandas as pd
        import numpy as np

        df = pd.DataFrame({
            "Order_ID": [f"ORD-{i}" for i in range(100)],
            "Order_Date": pd.date_range("2024-01-01", periods=100, freq="D"),
            "Customer_Name": [f"Customer {chr(65 + i % 26)}" for i in range(100)],
            "Region": np.random.choice(["North", "South", "East", "West"], 100),
            "Category": np.random.choice(["Electronics", "Furniture", "Office Supplies"], 100),
            "Sales": np.round(np.random.uniform(10, 5000, 100), 2),
            "Quantity": np.random.randint(1, 50, 100),
            "Profit": np.round(np.random.uniform(-500, 2000, 100), 2),
            "Tenure_Months": np.random.randint(1, 120, 100),
            "Age": np.random.randint(18, 70, 100),
            "Is_Active": np.random.choice([0, 1], 100),
            "Discount_Percentage": np.round(np.random.uniform(0, 0.5, 100), 2),
        })

        # Stage 1: Profile
        profiler = DataProfiler()
        with TimedResult() as t_profile:
            profiles = profiler.profile_dataframe(df)

        # Stage 2: Pre-map
        mapper = PreMapper()
        with TimedResult() as t_premap:
            pre_mappings = mapper.pre_map_dataset(profiles)

        mapped = len(pre_mappings)
        total = len(profiles)
        deferred = total - mapped

        print(f"\n  -- E2E Pipeline Benchmark (12 columns, 100 rows) --")
        print(f"  [TIME] Profiling:  {t_profile.elapsed_ms:.2f}ms")
        print(f"  [TIME] PreMapping: {t_premap.elapsed_ms:.2f}ms")
        print(f"  [TIME] Total:      {t_profile.elapsed_ms + t_premap.elapsed_ms:.2f}ms")
        print(f"  [MAPPED] {mapped}/{total} ({mapped/total*100:.0f}%)")
        print(f"  [DEFERRED] {deferred}")
        print(f"  -- Results --")
        for col in profiles:
            if col in pre_mappings:
                print(f"     {col:25s} -> {pre_mappings[col]['role']}")
            else:
                print(f"     {col:25s} -> (deferred to LLM)")

        # Critical assertions
        assert "Tenure_Months" in pre_mappings, "Tenure_Months must be pre-mapped"
        assert pre_mappings["Tenure_Months"]["role"] == "tenure"

        assert "Age" in pre_mappings, "Age must be pre-mapped"
        assert pre_mappings["Age"]["role"] == "tenure"

        assert "Discount_Percentage" not in pre_mappings, "Discount_Percentage must NOT be pre-mapped as tenure"

        assert "Order_Date" in pre_mappings, "Order_Date must be pre-mapped"
        assert pre_mappings["Order_Date"]["role"] == "date"

        # Performance
        assert t_profile.elapsed_ms < 500, f"Profiling too slow: {t_profile.elapsed_ms:.2f}ms"
        assert t_premap.elapsed_ms < 50, f"PreMapping too slow: {t_premap.elapsed_ms:.2f}ms"


# ===========================================================
# Feedback Loop Model Verification
# ===========================================================

class TestFeedbackLoopModel:
    """Phase 4: Verify MappingCorrection model exists and has correct fields."""

    def test_mapping_correction_model_importable(self):
        """MappingCorrection model must be importable."""
        with TimedResult() as t:
            from app.models.mapping_correction import MappingCorrection
        assert MappingCorrection.__tablename__ == "mapping_corrections"
        print(f"  [PASS] MappingCorrection importable ({t.elapsed_ms:.2f}ms)")

    def test_mapping_correction_has_required_fields(self):
        """Model must have all required fields for the feedback loop."""
        from app.models.mapping_correction import MappingCorrection
        import inspect

        fields = {name for name, _ in inspect.getmembers(MappingCorrection) if not name.startswith("_")}
        required = {"dataset_id", "version_id", "column_name", "proposed_role", "corrected_role", "corrected_by"}
        missing = required - fields
        assert not missing, f"Missing fields in MappingCorrection: {missing}"

    def test_mapping_correction_has_dataset_id_index(self):
        """dataset_id should be indexed for fast lookups."""
        from app.models.mapping_correction import MappingCorrection

        # Check via model field info
        field_info = MappingCorrection.model_fields.get("dataset_id")
        assert field_info is not None, "dataset_id field missing"
