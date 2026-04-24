"""
Section Registry — Domain-aware chart grouping rules.

Maps (domain × chart signals) → section heading for dashboard organization.
"""

from typing import Optional, List, Dict, Any
from dataclasses import dataclass


@dataclass
class SectionRule:
    id: str
    title: str
    icon: str
    priority: int
    match_metric: List[str]
    match_dimension: List[str]
    match_type: List[str]


def _matches(value: Optional[str], keywords: List[str]) -> bool:
    """Check if value contains any keyword (case-insensitive, separator-agnostic)."""
    if not value or not keywords:
        return False
    normalized = value.lower().replace("_", "").replace("-", "").replace(" ", "")
    return any(kw.replace("_", "") in normalized for kw in keywords)


# ────────────────────────────────────────────────────────────────────
# SALES DOMAIN
# ────────────────────────────────────────────────────────────────────
SALES_SECTIONS = [
    SectionRule(
        id="revenue_trends",
        title="Revenue & Profitability",
        icon="trending_up",
        priority=1,
        match_metric=["revenue", "sales", "profit", "income", "earnings", "gross", "net"],
        match_dimension=[],
        match_type=["line", "area"],
    ),
    SectionRule(
        id="product_performance",
        title="Product Performance",
        icon="inventory_2",
        priority=2,
        match_metric=["quantity", "units", "discount"],
        match_dimension=["product", "category", "subcategory", "sub_category", "sku", "item"],
        match_type=[],
    ),
    SectionRule(
        id="customer_analysis",
        title="Customer Analysis",
        icon="groups",
        priority=3,
        match_metric=[],
        match_dimension=["segment", "customer", "gender", "age"],
        match_type=[],
    ),
    SectionRule(
        id="geographic",
        title="Geographic Distribution",
        icon="map",
        priority=4,
        match_metric=[],
        match_dimension=["region", "state", "city", "country", "market"],
        match_type=["geo_map"],
    ),
    SectionRule(
        id="orders_logistics",
        title="Orders & Logistics",
        icon="local_shipping",
        priority=5,
        match_metric=["order", "shipping"],
        match_dimension=["ship", "delivery", "priority", "order_priority"],
        match_type=[],
    ),
]

# ────────────────────────────────────────────────────────────────────
# CHURN DOMAIN
# ────────────────────────────────────────────────────────────────────
CHURN_SECTIONS = [
    SectionRule(
        id="churn_overview",
        title="Churn Analysis",
        icon="person_off",
        priority=1,
        match_metric=["churn", "attrition", "retention"],
        match_dimension=["churn", "exited", "attrition"],
        match_type=[],
    ),
    SectionRule(
        id="service_adoption",
        title="Service & Product Adoption",
        icon="settings",
        priority=2,
        match_metric=[],
        match_dimension=["internet", "phone", "streaming", "security", "backup", "tech", "online"],
        match_type=[],
    ),
    SectionRule(
        id="billing_payment",
        title="Billing & Payments",
        icon="payments",
        priority=3,
        match_metric=["charges", "monthly", "total"],
        match_dimension=["payment", "billing", "contract", "paperless"],
        match_type=[],
    ),
    SectionRule(
        id="customer_profile",
        title="Customer Demographics",
        icon="person",
        priority=4,
        match_metric=["tenure", "age"],
        match_dimension=["gender", "senior", "partner", "dependents", "tenure"],
        match_type=[],
    ),
]

# ────────────────────────────────────────────────────────────────────
# HEALTHCARE DOMAIN
# ────────────────────────────────────────────────────────────────────
HEALTHCARE_SECTIONS = [
    SectionRule(
        id="patient_outcomes",
        title="Patient Outcomes",
        icon="monitor_heart",
        priority=1,
        match_metric=["mortality", "readmission", "los", "length_of_stay", "outcome"],
        match_dimension=["mortality", "readmission"],
        match_type=[],
    ),
    SectionRule(
        id="clinical",
        title="Clinical Analysis",
        icon="medical_services",
        priority=2,
        match_metric=["score", "vital", "bmi"],
        match_dimension=["diagnosis", "treatment", "drg", "icd", "medication", "condition"],
        match_type=[],
    ),
    SectionRule(
        id="facility_staff",
        title="Facility & Staff",
        icon="local_hospital",
        priority=3,
        match_metric=[],
        match_dimension=["hospital", "physician", "ward", "department", "admission", "discharge"],
        match_type=[],
    ),
    SectionRule(
        id="patient_demographics",
        title="Patient Demographics",
        icon="person",
        priority=4,
        match_metric=["age"],
        match_dimension=["gender", "age", "race", "ethnicity", "insurance"],
        match_type=[],
    ),
]

# ────────────────────────────────────────────────────────────────────
# MARKETING DOMAIN
# ────────────────────────────────────────────────────────────────────
MARKETING_SECTIONS = [
    SectionRule(
        id="campaign_performance",
        title="Campaign Performance",
        icon="campaign",
        priority=1,
        match_metric=["ctr", "conversion", "roas", "roi", "click", "impression"],
        match_dimension=["campaign", "adgroup", "creative"],
        match_type=[],
    ),
    SectionRule(
        id="channel_analysis",
        title="Channel Analysis",
        icon="hub",
        priority=2,
        match_metric=["spend", "cost"],
        match_dimension=["channel", "source", "medium"],
        match_type=[],
    ),
    SectionRule(
        id="audience",
        title="Audience Insights",
        icon="groups",
        priority=3,
        match_metric=[],
        match_dimension=["segment", "demographics", "age", "gender", "location"],
        match_type=[],
    ),
]

# ────────────────────────────────────────────────────────────────────
# FINANCE DOMAIN
# ────────────────────────────────────────────────────────────────────
FINANCE_SECTIONS = [
    SectionRule(
        id="income_expense",
        title="Income & Expenses",
        icon="account_balance",
        priority=1,
        match_metric=["income", "expense", "revenue", "cost", "salary"],
        match_dimension=[],
        match_type=["line", "area"],
    ),
    SectionRule(
        id="assets_liabilities",
        title="Assets & Liabilities",
        icon="balance",
        priority=2,
        match_metric=["asset", "liability", "equity", "balance", "loan", "credit"],
        match_dimension=[],
        match_type=[],
    ),
    SectionRule(
        id="transactions",
        title="Transaction Analysis",
        icon="receipt_long",
        priority=3,
        match_metric=["transaction", "payment", "amount"],
        match_dimension=["transaction", "payment", "card", "method"],
        match_type=[],
    ),
]

# ────────────────────────────────────────────────────────────────────
# GENERIC DOMAIN (fallback — group by chart purpose)
# ────────────────────────────────────────────────────────────────────
GENERIC_SECTIONS = [
    SectionRule(
        id="trends",
        title="Trends Over Time",
        icon="trending_up",
        priority=1,
        match_metric=[],
        match_dimension=["date", "time", "month", "year", "week", "quarter"],
        match_type=["line", "area"],
    ),
    SectionRule(
        id="distributions",
        title="Distributions",
        icon="pie_chart",
        priority=2,
        match_metric=[],
        match_dimension=[],
        match_type=["pie", "donut"],
    ),
    SectionRule(
        id="comparisons",
        title="Comparisons",
        icon="bar_chart",
        priority=3,
        match_metric=[],
        match_dimension=[],
        match_type=["bar", "hbar", "stacked"],
    ),
    SectionRule(
        id="geographic",
        title="Geographic",
        icon="map",
        priority=4,
        match_metric=[],
        match_dimension=[],
        match_type=["geo_map"],
    ),
]


# ────────────────────────────────────────────────────────────────────
# REGISTRY
# ────────────────────────────────────────────────────────────────────
DOMAIN_SECTION_REGISTRY: Dict[str, List[SectionRule]] = {
    "sales": SALES_SECTIONS,
    "churn": CHURN_SECTIONS,
    "healthcare": HEALTHCARE_SECTIONS,
    "marketing": MARKETING_SECTIONS,
    "finance": FINANCE_SECTIONS,
    "generic": GENERIC_SECTIONS,
}

DEFAULT_SECTION = "Other Insights"
DEFAULT_SECTION_ICON = "auto_awesome"


def assign_section(
    chart_type: str,
    metric: Optional[str],
    dimension: Optional[str],
    domain: str,
) -> Dict[str, str]:
    """
    Assign a section to a chart based on domain rules.

    Returns: {"section": "Revenue & Profitability", "section_icon": "trending_up"}
    """
    rules = DOMAIN_SECTION_REGISTRY.get(domain, GENERIC_SECTIONS)

    for rule in rules:
        # Match by chart type
        if rule.match_type and chart_type in rule.match_type:
            return {"section": rule.title, "section_icon": rule.icon}

        # Match by metric keywords
        if rule.match_metric and _matches(metric, rule.match_metric):
            return {"section": rule.title, "section_icon": rule.icon}

        # Match by dimension keywords
        if rule.match_dimension and _matches(dimension, rule.match_dimension):
            return {"section": rule.title, "section_icon": rule.icon}

    return {"section": DEFAULT_SECTION, "section_icon": DEFAULT_SECTION_ICON}
