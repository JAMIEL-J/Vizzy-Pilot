"""
Section Registry — Domain-aware chart grouping rules.

Maps (domain × chart signals) → section heading for dashboard organization.
"""

from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field

@dataclass
class SectionRule:
    id: str
    title: str
    icon: str
    priority: int
    match_metric: List[str]
    match_dimension: List[str]
    match_type: List[str]
    match_title: List[str] = field(default_factory=list)
    # Weights to prioritize different signals
    weight_metric: float = 1.0
    weight_dimension: float = 2.0
    weight_type: float = 1.5
    weight_title: float = 2.5

@dataclass
class SectionAssignment:
    section: str
    section_icon: str

def _normalize(value: Optional[str]) -> str:
    """Normalize string for separator-agnostic, case-insensitive matching."""
    if not value:
        return ""
    return value.lower().replace("_", "").replace("-", "").replace(" ", "")

def _matches(normalized_value: str, keywords: List[str]) -> bool:
    """Check if normalized value contains any keyword."""
    if not normalized_value or not keywords:
        return False
    return any(_normalize(kw) in normalized_value for kw in keywords)

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
        match_title=["revenue", "profit", "sales"],
    ),
    SectionRule(
        id="product_performance",
        title="Product Performance",
        icon="inventory_2",
        priority=2,
        match_metric=["quantity", "units", "discount"],
        match_dimension=["product", "category", "subcategory", "sub_category", "sku", "item"],
        match_type=[],
        match_title=["product", "category", "sku"],
    ),
    SectionRule(
        id="customer_analysis",
        title="Customer Analysis",
        icon="groups",
        priority=3,
        match_metric=[],
        match_dimension=["segment", "customer", "gender", "age"],
        match_type=[],
        match_title=["customer", "segment", "gender", "demographic"],
    ),
    SectionRule(
        id="geographic",
        title="Geographic Distribution",
        icon="map",
        priority=4,
        match_metric=[],
        match_dimension=["region", "state", "city", "country", "market"],
        match_type=["geo_map"],
        match_title=["map", "geographic", "region", "state", "country"],
    ),
    SectionRule(
        id="orders_logistics",
        title="Orders & Logistics",
        icon="local_shipping",
        priority=5,
        match_metric=["order", "shipping"],
        match_dimension=["ship", "delivery", "priority", "order_priority"],
        match_type=[],
        match_title=["order", "shipping", "delivery", "logistics"],
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
        match_title=["churn", "attrition", "retention", "exit"],
    ),
    SectionRule(
        id="service_adoption",
        title="Service & Product Adoption",
        icon="settings",
        priority=2,
        match_metric=[],
        match_dimension=["internet", "phone", "streaming", "security", "backup", "tech", "online"],
        match_type=[],
        match_title=["service", "product", "adoption", "internet", "phone", "streaming"],
    ),
    SectionRule(
        id="billing_payment",
        title="Billing & Payments",
        icon="payments",
        priority=3,
        match_metric=["charges", "monthly", "total"],
        match_dimension=["payment", "billing", "contract", "paperless"],
        match_type=[],
        match_title=["billing", "payment", "contract", "charges"],
    ),
    SectionRule(
        id="customer_profile",
        title="Customer Demographics",
        icon="person",
        priority=4,
        match_metric=["tenure", "age"],
        match_dimension=["gender", "senior", "partner", "dependents", "tenure"],
        match_type=[],
        match_title=["demographic", "profile", "gender", "age", "tenure"],
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
        match_title=["outcome", "mortality", "readmission", "los"],
    ),
    SectionRule(
        id="clinical",
        title="Clinical Analysis",
        icon="medical_services",
        priority=2,
        match_metric=["score", "vital", "bmi"],
        match_dimension=["diagnosis", "treatment", "drg", "icd", "medication", "condition"],
        match_type=[],
        match_title=["clinical", "diagnosis", "treatment", "vital"],
    ),
    SectionRule(
        id="facility_staff",
        title="Facility & Staff",
        icon="local_hospital",
        priority=3,
        match_metric=[],
        match_dimension=["hospital", "physician", "ward", "department", "admission", "discharge"],
        match_type=[],
        match_title=["facility", "hospital", "staff", "physician", "ward"],
    ),
    SectionRule(
        id="patient_demographics",
        title="Patient Demographics",
        icon="person",
        priority=4,
        match_metric=["age"],
        match_dimension=["gender", "age", "race", "ethnicity", "insurance"],
        match_type=[],
        match_title=["demographic", "patient", "gender", "age"],
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
        match_title=["campaign", "performance", "conversion", "roi", "roas"],
    ),
    SectionRule(
        id="channel_analysis",
        title="Channel Analysis",
        icon="hub",
        priority=2,
        match_metric=["spend", "cost"],
        match_dimension=["channel", "source", "medium"],
        match_type=[],
        match_title=["channel", "source", "medium", "spend", "cost"],
    ),
    SectionRule(
        id="audience",
        title="Audience Insights",
        icon="groups",
        priority=3,
        match_metric=[],
        match_dimension=["segment", "demographics", "age", "gender", "location"],
        match_type=[],
        match_title=["audience", "segment", "demographic", "insight"],
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
        match_title=["income", "expense", "revenue", "cost", "salary"],
    ),
    SectionRule(
        id="assets_liabilities",
        title="Assets & Liabilities",
        icon="balance",
        priority=2,
        match_metric=["asset", "liability", "equity", "balance", "loan", "credit"],
        match_dimension=[],
        match_type=[],
        match_title=["asset", "liability", "equity", "balance", "loan"],
    ),
    SectionRule(
        id="transactions",
        title="Transaction Analysis",
        icon="receipt_long",
        priority=3,
        match_metric=["transaction", "payment", "amount"],
        match_dimension=["transaction", "payment", "card", "method"],
        match_type=[],
        match_title=["transaction", "payment", "amount"],
    ),
]

# ────────────────────────────────────────────────────────────────────
# HR DOMAIN
# ────────────────────────────────────────────────────────────────────
HR_SECTIONS = [
    SectionRule(
        id="workforce_overview",
        title="Workforce Overview",
        icon="groups",
        priority=1,
        match_metric=["headcount", "employee", "staff"],
        match_dimension=["department", "team", "role", "job", "title"],
        match_type=["bar", "hbar", "pie", "donut"],
        match_title=["employee", "headcount", "workforce"],
    ),
    SectionRule(
        id="attrition_retention",
        title="Attrition & Retention",
        icon="person_off",
        priority=2,
        match_metric=["attrition", "turnover", "retention", "churn"],
        match_dimension=["attrition", "turnover", "status", "left"],
        match_type=["bar", "hbar", "donut"],
        match_title=["attrition", "turnover", "retention"],
    ),
    SectionRule(
        id="comp_performance",
        title="Compensation & Performance",
        icon="payments",
        priority=3,
        match_metric=["salary", "pay", "compensation", "bonus", "performance", "rating", "score"],
        match_dimension=["role", "job", "level", "grade", "department"],
        match_type=["bar", "hbar"],
        match_title=["salary", "performance", "rating"],
    ),
    SectionRule(
        id="mobility_demo",
        title="Mobility & Demographics",
        icon="travel_explore",
        priority=4,
        match_metric=["tenure", "age", "experience"],
        match_dimension=["gender", "travel", "location", "office"],
        match_type=["pie", "donut", "bar"],
        match_title=["demographic", "travel", "location", "tenure"],
    ),
]

# ────────────────────────────────────────────────────────────────────
# LOGISTICS DOMAIN
# ────────────────────────────────────────────────────────────────────
LOGISTICS_SECTIONS = [
    SectionRule(
        id="delivery_performance",
        title="Delivery Performance",
        icon="local_shipping",
        priority=1,
        match_metric=["delivery", "transit", "late", "delay", "lead"],
        match_dimension=["carrier", "route", "origin", "destination"],
        match_type=["bar", "hbar", "line"],
        match_title=["delivery", "transit", "late"],
    ),
    SectionRule(
        id="cost_efficiency",
        title="Cost & Efficiency",
        icon="attach_money",
        priority=2,
        match_metric=["cost", "freight", "shipping", "expense"],
        match_dimension=["carrier", "route", "mode"],
        match_type=["bar", "hbar"],
        match_title=["cost", "freight", "shipping"],
    ),
    SectionRule(
        id="inventory_warehousing",
        title="Inventory & Warehousing",
        icon="warehouse",
        priority=3,
        match_metric=["inventory", "stock"],
        match_dimension=["warehouse", "facility"],
        match_type=["bar", "hbar"],
        match_title=["inventory", "warehouse"],
    ),
    SectionRule(
        id="logistics_geo",
        title="Network Footprint",
        icon="map",
        priority=4,
        match_metric=[],
        match_dimension=["region", "country", "city", "origin", "destination"],
        match_type=["geo_map"],
        match_title=["map", "region", "country"],
    ),
]

# ────────────────────────────────────────────────────────────────────
# EDUCATION DOMAIN
# ────────────────────────────────────────────────────────────────────
EDUCATION_SECTIONS = [
    SectionRule(
        id="enrollment",
        title="Enrollment & Cohorts",
        icon="school",
        priority=1,
        match_metric=["enrollment", "student", "headcount"],
        match_dimension=["program", "course", "class", "cohort", "year"],
        match_type=["bar", "hbar", "pie", "donut"],
        match_title=["enrollment", "cohort"],
    ),
    SectionRule(
        id="academic_performance",
        title="Academic Performance",
        icon="bar_chart",
        priority=2,
        match_metric=["gpa", "grade", "score", "marks"],
        match_dimension=["program", "course", "class"],
        match_type=["bar", "hbar"],
        match_title=["gpa", "grade", "score"],
    ),
    SectionRule(
        id="attendance",
        title="Attendance & Engagement",
        icon="event_available",
        priority=3,
        match_metric=["attendance", "presence"],
        match_dimension=["class", "course", "program"],
        match_type=["bar", "hbar"],
        match_title=["attendance", "engagement"],
    ),
    SectionRule(
        id="outcomes",
        title="Outcomes",
        icon="emoji_events",
        priority=4,
        match_metric=["graduation", "completion", "pass"],
        match_dimension=["status", "outcome"],
        match_type=["bar", "donut"],
        match_title=["completion", "graduation"],
    ),
]

# ────────────────────────────────────────────────────────────────────
# ECOMMERCE DOMAIN
# ────────────────────────────────────────────────────────────────────
ECOMMERCE_SECTIONS = [
    SectionRule(
        id="revenue_orders",
        title="Revenue & Orders",
        icon="shopping_cart",
        priority=1,
        match_metric=["revenue", "sales", "orders", "gmv"],
        match_dimension=["category", "product", "brand"],
        match_type=["bar", "hbar", "line"],
        match_title=["revenue", "orders"],
    ),
    SectionRule(
        id="conversion_funnel",
        title="Conversion & Funnel",
        icon="swap_vert",
        priority=2,
        match_metric=["conversion", "cvr", "abandonment", "cart"],
        match_dimension=["channel", "device", "source"],
        match_type=["bar", "hbar"],
        match_title=["conversion", "abandon"],
    ),
    SectionRule(
        id="customer_segments",
        title="Customer & Segments",
        icon="groups",
        priority=3,
        match_metric=[],
        match_dimension=["customer", "segment", "cohort"],
        match_type=["bar", "donut"],
        match_title=["customer", "segment"],
    ),
    SectionRule(
        id="fulfillment",
        title="Fulfillment & Returns",
        icon="local_shipping",
        priority=4,
        match_metric=["refund", "return", "shipping"],
        match_dimension=["status", "carrier"],
        match_type=["bar", "hbar"],
        match_title=["fulfillment", "return"],
    ),
]

# ────────────────────────────────────────────────────────────────────
# REAL ESTATE DOMAIN
# ────────────────────────────────────────────────────────────────────
REAL_ESTATE_SECTIONS = [
    SectionRule(
        id="listings_pricing",
        title="Listings & Pricing",
        icon="home",
        priority=1,
        match_metric=["price", "rent", "listing"],
        match_dimension=["property", "listing", "type"],
        match_type=["bar", "hbar", "line"],
        match_title=["price", "listing"],
    ),
    SectionRule(
        id="market_velocity",
        title="Market Velocity",
        icon="speed",
        priority=2,
        match_metric=["days on market", "dom", "time"],
        match_dimension=["property", "type"],
        match_type=["bar", "hbar"],
        match_title=["days", "market"],
    ),
    SectionRule(
        id="occupancy",
        title="Occupancy & Tenancy",
        icon="meeting_room",
        priority=3,
        match_metric=["occupancy", "vacancy"],
        match_dimension=["status", "tenant", "lease"],
        match_type=["bar", "donut"],
        match_title=["occupancy", "vacancy"],
    ),
    SectionRule(
        id="agent_performance",
        title="Agent Performance",
        icon="person",
        priority=4,
        match_metric=[],
        match_dimension=["agent", "broker", "realtor"],
        match_type=["bar", "hbar"],
        match_title=["agent", "broker"],
    ),
]

# ────────────────────────────────────────────────────────────────────
# CUSTOMER SUPPORT DOMAIN
# ────────────────────────────────────────────────────────────────────
CUSTOMER_SUPPORT_SECTIONS = [
    SectionRule(
        id="ticket_volume",
        title="Ticket Volume",
        icon="inbox",
        priority=1,
        match_metric=["ticket", "case", "volume"],
        match_dimension=["category", "channel", "priority"],
        match_type=["bar", "hbar", "donut"],
        match_title=["ticket", "case"],
    ),
    SectionRule(
        id="service_levels",
        title="Service Levels",
        icon="check_circle",
        priority=2,
        match_metric=["sla", "response", "resolution", "time"],
        match_dimension=["priority", "channel"],
        match_type=["bar", "hbar", "line"],
        match_title=["sla", "response", "resolution"],
    ),
    SectionRule(
        id="satisfaction",
        title="Customer Satisfaction",
        icon="sentiment_satisfied",
        priority=3,
        match_metric=["csat", "satisfaction", "survey"],
        match_dimension=["channel", "agent"],
        match_type=["bar", "hbar"],
        match_title=["csat", "satisfaction"],
    ),
]

# ────────────────────────────────────────────────────────────────────
# IT OPERATIONS DOMAIN
# ────────────────────────────────────────────────────────────────────
IT_OPERATIONS_SECTIONS = [
    SectionRule(
        id="availability_incidents",
        title="Availability & Incidents",
        icon="dns",
        priority=1,
        match_metric=["uptime", "downtime", "incident", "alert"],
        match_dimension=["service", "system", "app"],
        match_type=["bar", "hbar", "line"],
        match_title=["uptime", "incident"],
    ),
    SectionRule(
        id="performance_latency",
        title="Performance & Latency",
        icon="speed",
        priority=2,
        match_metric=["latency", "response"],
        match_dimension=["service", "region"],
        match_type=["bar", "line"],
        match_title=["latency", "performance"],
    ),
    SectionRule(
        id="infra_utilization",
        title="Infrastructure Utilization",
        icon="memory",
        priority=3,
        match_metric=["cpu", "memory", "utilization"],
        match_dimension=["host", "node", "cluster"],
        match_type=["bar", "hbar"],
        match_title=["cpu", "memory"],
    ),
    SectionRule(
        id="change_deployments",
        title="Change & Deployments",
        icon="sync",
        priority=4,
        match_metric=["deploy", "release", "change"],
        match_dimension=["environment", "version"],
        match_type=["bar", "line"],
        match_title=["deploy", "release"],
    ),
]

# ────────────────────────────────────────────────────────────────────
# CYBERSECURITY DOMAIN
# ────────────────────────────────────────────────────────────────────
CYBERSECURITY_SECTIONS = [
    SectionRule(
        id="threat_detection",
        title="Threat Detection",
        icon="security",
        priority=1,
        match_metric=["alert", "threat", "incident"],
        match_dimension=["attack", "type", "source", "severity"],
        match_type=["bar", "hbar", "donut"],
        match_title=["threat", "alert"],
    ),
    SectionRule(
        id="vulnerability_risk",
        title="Vulnerability & Risk",
        icon="bug_report",
        priority=2,
        match_metric=["vulnerability", "risk", "cve"],
        match_dimension=["asset", "endpoint", "host"],
        match_type=["bar", "hbar"],
        match_title=["vulnerability", "risk"],
    ),
    SectionRule(
        id="incident_response",
        title="Incident Response",
        icon="health_and_safety",
        priority=3,
        match_metric=["remediate", "mttr", "response"],
        match_dimension=["severity", "team"],
        match_type=["bar", "hbar", "line"],
        match_title=["response", "remediation"],
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
    "hr": HR_SECTIONS,
    "logistics": LOGISTICS_SECTIONS,
    "education": EDUCATION_SECTIONS,
    "ecommerce": ECOMMERCE_SECTIONS,
    "real_estate": REAL_ESTATE_SECTIONS,
    "customer_support": CUSTOMER_SUPPORT_SECTIONS,
    "it_operations": IT_OPERATIONS_SECTIONS,
    "cybersecurity": CYBERSECURITY_SECTIONS,
    "generic": GENERIC_SECTIONS,
}

DEFAULT_SECTION = "Other Insights"
DEFAULT_SECTION_ICON = "auto_awesome"


def assign_section(
    chart_type: str,
    metric: Optional[str],
    dimension: Optional[str],
    domain: str,
    title: str = "",
) -> SectionAssignment:
    """
    Assign a section to a chart using a weighted scoring system to ensure robust grouping.
    """
    # print(f"DEBUG: assign_section called - domain: {domain}, chart_type: {chart_type}, metric: {metric}, dimension: {dimension}, title: {title}")
    rules = DOMAIN_SECTION_REGISTRY.get(domain, GENERIC_SECTIONS)

    # Pre-normalize inputs
    norm_chart_type = _normalize(chart_type)
    norm_metric = _normalize(metric)
    norm_dimension = _normalize(dimension)
    norm_title = _normalize(title)

    best_section = None
    max_score = -1.0

    for rule in rules:
        score = 0.0

        # 1. Title Match (Highest Signal)
        if rule.match_title and _matches(norm_title, rule.match_title):
            score += rule.weight_title

        # 2. Dimension Match (Strong Signal)
        if rule.match_dimension and _matches(norm_dimension, rule.match_dimension):
            score += rule.weight_dimension

        # 3. Metric Match (Moderate Signal)
        if rule.match_metric and _matches(norm_metric, rule.match_metric):
            score += rule.weight_metric

        # 4. Type Match (Supporting Signal)
        if rule.match_type:
            if any(_normalize(t) == norm_chart_type for t in rule.match_type):
                score += rule.weight_type

        # Tie-breaking: adjust score slightly based on priority (lower priority number = better)
        # We subtract a tiny fraction based on priority so that if scores are equal,
        # the one with the lower priority number wins.
        score -= (rule.priority * 0.001)

        if score > max_score and score > 0:
            max_score = score
            best_section = rule

    if best_section:
        # print(f"DEBUG: Selected section {best_section.title} with score {max_score:.3f}")
        return SectionAssignment(section=best_section.title, section_icon=best_section.icon)

    # print(f"DEBUG: No match found. Falling back to {DEFAULT_SECTION}")
    return SectionAssignment(section=DEFAULT_SECTION, section_icon=DEFAULT_SECTION_ICON)
