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

# Words that are too common to be useful signals on their own
GENERIC_NOISE_WORDS = {
    "total", "monthly", "yearly", "daily", "count", "amount", "value", "sum",
    "avg", "average", "min", "max", "percentage", "rate", "index"
}

def _matches(normalized_value: str, keywords: List[str]) -> bool:
    """Check if normalized value contains any keyword, ignoring generic noise."""
    if not normalized_value or not keywords:
        return False

    for kw in keywords:
        norm_kw = _normalize(kw)
        if not norm_kw: continue

        # If the keyword itself is a generic noise word,
        # it only matches if the value is an EXACT match, not just "contains"
        if norm_kw in GENERIC_NOISE_WORDS:
            if norm_kw == normalized_value:
                return True
            continue

        if norm_kw in normalized_value:
            return True
    return False


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
        match_metric=["churn", "attrition", "retention", "exit_rate", "churn_prob"],
        match_dimension=["churn", "exited", "attrition", "status"],
        match_type=[],
        match_title=["churn", "attrition", "retention", "exit", "loss"],
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
        match_metric=["billing", "invoice", "payment_fee"],
        match_dimension=["payment", "billing", "contract", "paperless"],
        match_type=[],
        match_title=["billing", "payment", "contract", "invoice"],
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
        match_metric=["mortality", "readmission", "los", "length_of_stay", "outcome", "survival", "recovery"],
        match_dimension=["mortality", "readmission", "survival", "outcome"],
        match_type=[],
        match_title=["outcome", "mortality", "readmission", "los", "survival", "recovery", "prognosis"],
    ),
    SectionRule(
        id="clinical",
        title="Clinical Analysis",
        icon="medical_services",
        priority=2,
        match_metric=["score", "vital", "bmi", "lab", "glucose", "blood_pressure"],
        match_dimension=["diagnosis", "treatment", "drg", "icd", "medication", "condition", "symptom"],
        match_type=[],
        match_title=["clinical", "diagnosis", "treatment", "vital", "lab", "symptom", "medication"],
    ),
    SectionRule(
        id="facility_staff",
        title="Facility & Staff",
        icon="local_hospital",
        priority=3,
        match_metric=[],
        match_dimension=["hospital", "physician", "ward", "department", "admission", "discharge", "nurse", "clinic"],
        match_type=[],
        match_title=["facility", "hospital", "staff", "physician", "ward", "clinic", "department"],
    ),
    SectionRule(
        id="patient_demographics",
        title="Patient Demographics",
        icon="person",
        priority=4,
        match_metric=["age"],
        match_dimension=["gender", "age", "race", "ethnicity", "insurance", "patient"],
        match_type=[],
        match_title=["demographic", "patient", "gender", "age", "race", "ethnicity"],
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
        match_metric=["ctr", "conversion", "roas", "roi", "click", "impression", "conversion_rate", "leads", "acquisition"],
        match_dimension=["campaign", "adgroup", "creative", "ad_id"],
        match_type=[],
        match_title=["campaign", "performance", "conversion", "roi", "roas", "acquisition", "lead"],
    ),
    SectionRule(
        id="channel_analysis",
        title="Channel Analysis",
        icon="hub",
        priority=2,
        match_metric=["acquisition_cost", "cpa", "cpc", "cpm"],
        match_dimension=["channel", "source", "medium", "referral", "organic", "paid", "social"],
        match_type=[],
        match_title=["channel", "source", "medium", "attribution", "referral", "traffic"],
    ),
    SectionRule(
        id="audience",
        title="Audience Insights",
        icon="groups",
        priority=3,
        match_metric=[],
        match_dimension=["segment", "demographics", "age", "gender", "location", "target", "persona"],
        match_type=[],
        match_title=["audience", "segment", "demographic", "insight", "target", "persona"],
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
        match_metric=["income", "expense", "revenue", "cost", "salary", "spending", "cash_flow", "profit", "loss"],
        match_dimension=[],
        match_type=["line", "area"],
        match_title=["income", "expense", "revenue", "cost", "salary", "spending", "cashflow", "profit", "loss"],
    ),
    SectionRule(
        id="assets_liabilities",
        title="Assets & Liabilities",
        icon="balance",
        priority=2,
        match_metric=["asset", "liability", "equity", "balance", "loan", "credit", "debt", "capital"],
        match_dimension=[],
        match_type=[],
        match_title=["asset", "liability", "equity", "balance", "loan", "credit", "debt", "capital"],
    ),
    SectionRule(
        id="transactions",
        title="Transaction Analysis",
        icon="receipt_long",
        priority=3,
        match_metric=["transaction", "payment", "amount", "billing", "invoice"],
        match_dimension=["transaction", "payment", "card", "method", "merchant"],
        match_type=[],
        match_title=["transaction", "payment", "amount", "billing", "invoice", "audit"],
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
        match_metric=["headcount", "employee", "staff", "fulltime", "parttime", "contractor"],
        match_dimension=["department", "team", "role", "job", "title", "level", "grade", "location"],
        match_type=["bar", "hbar", "pie", "donut"],
        match_title=["employee", "headcount", "workforce", "staffing", "distribution"],
    ),
    SectionRule(
        id="attrition_retention",
        title="Attrition & Retention",
        icon="person_off",
        priority=2,
        match_metric=["attrition", "turnover", "retention", "churn", "exit_rate"],
        match_dimension=["attrition", "turnover", "status", "left", "tenure", "reason"],
        match_type=["bar", "hbar", "donut"],
        match_title=["attrition", "turnover", "retention", "exit", "loss", "churn"],
    ),
    SectionRule(
        id="comp_performance",
        title="Compensation & Performance",
        icon="payments",
        priority=3,
        match_metric=["salary", "pay", "compensation", "bonus", "performance", "rating", "score", "equity", "commission"],
        match_dimension=["role", "job", "level", "grade", "department", "manager"],
        match_type=["bar", "hbar"],
        match_title=["salary", "performance", "rating", "compensation", "pay", "bonus"],
    ),
    SectionRule(
        id="mobility_demo",
        title="Mobility & Demographics",
        icon="travel_explore",
        priority=4,
        match_metric=["tenure", "age", "experience", "years_exp"],
        match_dimension=["gender", "travel", "location", "office", "race", "ethnicity", "education"],
        match_type=["pie", "donut", "bar"],
        match_title=["demographic", "travel", "location", "tenure", "experience", "diversity"],
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
        match_metric=["delivery", "transit", "late", "delay", "lead", "otif", "on_time", "cycle_time"],
        match_dimension=["carrier", "route", "origin", "destination", "shipment_id"],
        match_type=["bar", "hbar", "line"],
        match_title=["delivery", "transit", "late", "on_time", "lead_time", "performance"],
    ),
    SectionRule(
        id="cost_efficiency",
        title="Cost & Efficiency",
        icon="attach_money",
        priority=2,
        match_metric=["cost", "freight", "shipping", "expense", "fuel", "toll", "tariff"],
        match_dimension=["carrier", "route", "mode", "weight", "volume"],
        match_type=["bar", "hbar"],
        match_title=["cost", "freight", "shipping", "expense", "efficiency"],
    ),
    SectionRule(
        id="inventory_warehousing",
        title="Inventory & Warehousing",
        icon="warehouse",
        priority=3,
        match_metric=["inventory", "stock", "sku_count", "turnover", "shrinkage", "capacity"],
        match_dimension=["warehouse", "facility", "zone", "bin", "aisle"],
        match_type=["bar", "hbar"],
        match_title=["inventory", "warehouse", "stock", "storage", "capacity"],
    ),
    SectionRule(
        id="logistics_geo",
        title="Network Footprint",
        icon="map",
        priority=4,
        match_metric=[],
        match_dimension=["region", "country", "city", "origin", "destination", "hub", "port"],
        match_type=["geo_map"],
        match_title=["map", "region", "country", "footprint", "geographic"],
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
        match_metric=["enrollment", "student", "headcount", "registration", "admission"],
        match_dimension=["program", "course", "class", "cohort", "year", "major", "degree"],
        match_type=["bar", "hbar", "pie", "donut"],
        match_title=["enrollment", "cohort", "student", "registration"],
    ),
    SectionRule(
        id="academic_performance",
        title="Academic Performance",
        icon="bar_chart",
        priority=2,
        match_metric=["gpa", "grade", "score", "marks", "test_score", "average"],
        match_dimension=["program", "course", "class", "student_id", "subject"],
        match_type=["bar", "hbar"],
        match_title=["gpa", "grade", "score", "performance", "academic"],
    ),
    SectionRule(
        id="attendance",
        title="Attendance & Engagement",
        icon="event_available",
        priority=3,
        match_metric=["attendance", "presence", "participation", "engagement_rate"],
        match_dimension=["class", "course", "program", "session", "date"],
        match_type=["bar", "hbar"],
        match_title=["attendance", "engagement", "presence", "participation"],
    ),
    SectionRule(
        id="outcomes",
        title="Outcomes",
        icon="emoji_events",
        priority=4,
        match_metric=["graduation", "completion", "pass", "failure", "dropout", "employment_rate"],
        match_dimension=["status", "outcome", "degree", "major"],
        match_type=["bar", "donut"],
        match_title=["completion", "graduation", "outcome", "success_rate"],
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
        match_metric=["revenue", "sales", "orders", "gmv", "aov", "ticket_size"],
        match_dimension=["category", "product", "brand", "seller", "store"],
        match_type=["bar", "hbar", "line"],
        match_title=["revenue", "orders", "sales", "gmv", "earnings"],
    ),
    SectionRule(
        id="conversion_funnel",
        title="Conversion & Funnel",
        icon="swap_vert",
        priority=2,
        match_metric=["conversion", "cvr", "abandonment", "cart", "bounce_rate", "click_through"],
        match_dimension=["channel", "device", "source", "landing_page", "campaign"],
        match_type=["bar", "hbar"],
        match_title=["conversion", "abandon", "funnel", "cvr", "checkout"],
    ),
    SectionRule(
        id="customer_segments",
        title="Customer & Segments",
        icon="groups",
        priority=3,
        match_metric=["clv", "ltv", "churn_rate", "repeat_purchase"],
        match_dimension=["customer", "segment", "cohort", "loyalty_tier", "member_type"],
        match_type=["bar", "donut"],
        match_title=["customer", "segment", "loyalty", "cohort", "lifetime_value"],
    ),
    SectionRule(
        id="fulfillment",
        title="Fulfillment & Returns",
        icon="local_shipping",
        priority=4,
        match_metric=["refund", "return", "shipping", "delivery_time", "lead_time"],
        match_dimension=["status", "carrier", "warehouse", "region"],
        match_type=["bar", "hbar"],
        match_title=["fulfillment", "return", "shipping", "delivery", "logistics"],
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
        match_metric=["price", "rent", "listing", "valuation", "sqft_price"],
        match_dimension=["property", "listing", "type", "neighborhood", "zipcode"],
        match_type=["bar", "hbar", "line"],
        match_title=["price", "listing", "valuation", "rent"],
    ),
    SectionRule(
        id="market_velocity",
        title="Market Velocity",
        icon="speed",
        priority=2,
        match_metric=["days on market", "dom", "time", "absorption_rate", "turnover"],
        match_dimension=["property", "type", "listing_agent"],
        match_type=["bar", "hbar"],
        match_title=["days", "market", "velocity", "dom"],
    ),
    SectionRule(
        id="occupancy",
        title="Occupancy & Tenancy",
        icon="meeting_room",
        priority=3,
        match_metric=["occupancy", "vacancy", "tenancy_rate", "rent_roll"],
        match_dimension=["status", "tenant", "lease", "property_type"],
        match_type=["bar", "donut"],
        match_title=["occupancy", "vacancy", "tenancy", "lease"],
    ),
    SectionRule(
        id="agent_performance",
        title="Agent Performance",
        icon="person",
        priority=4,
        match_metric=["commission", "sales_vol", "closings", "lead_conv"],
        match_dimension=["agent", "broker", "realtor", "team"],
        match_type=["bar", "hbar"],
        match_title=["agent", "broker", "performance", "commission"],
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
        match_metric=["ticket", "case", "volume", "request_count", "incident"],
        match_dimension=["category", "channel", "priority", "source", "product"],
        match_type=["bar", "hbar", "donut"],
        match_title=["ticket", "case", "volume", "requests"],
    ),
    SectionRule(
        id="service_levels",
        title="Service Levels",
        icon="check_circle",
        priority=2,
        match_metric=["sla", "response", "resolution", "time", "aht", "frt"],
        match_dimension=["priority", "channel", "agent", "tier"],
        match_type=["bar", "hbar", "line"],
        match_title=["sla", "response", "resolution", "time", "handling"],
    ),
    SectionRule(
        id="satisfaction",
        title="Customer Satisfaction",
        icon="sentiment_satisfied",
        priority=3,
        match_metric=["csat", "satisfaction", "survey", "nps", "effort_score"],
        match_dimension=["channel", "agent", "category", "customer_segment"],
        match_type=["bar", "hbar"],
        match_title=["csat", "satisfaction", "nps", "survey"],
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
        match_metric=["uptime", "downtime", "incident", "alert", "error_rate", "outage"],
        match_dimension=["service", "system", "app", "component", "region"],
        match_type=["bar", "hbar", "line"],
        match_title=["uptime", "incident", "availability", "outage"],
    ),
    SectionRule(
        id="performance_latency",
        title="Performance & Latency",
        icon="speed",
        priority=2,
        match_metric=["latency", "response", "throughput", "request_time", "p99", "p95"],
        match_dimension=["service", "region", "endpoint", "api"],
        match_type=["bar", "line"],
        match_title=["latency", "performance", "response_time"],
    ),
    SectionRule(
        id="infra_utilization",
        title="Infrastructure Utilization",
        icon="memory",
        priority=3,
        match_metric=["cpu", "memory", "utilization", "disk", "network_io"],
        match_dimension=["host", "node", "cluster", "instance", "pod"],
        match_type=["bar", "hbar"],
        match_title=["cpu", "memory", "utilization", "infra"],
    ),
    SectionRule(
        id="change_deployments",
        title="Change & Deployments",
        icon="sync",
        priority=4,
        match_metric=["deploy", "release", "change", "rollout", "failure_rate"],
        match_dimension=["environment", "version", "app", "branch"],
        match_type=["bar", "line"],
        match_title=["deploy", "release", "change", "rollout"],
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
        match_metric=["alert", "threat", "incident", "attack", "anomaly"],
        match_dimension=["attack", "type", "source", "severity", "vector", "target"],
        match_type=["bar", "hbar", "donut"],
        match_title=["threat", "alert", "attack", "detection"],
    ),
    SectionRule(
        id="vulnerability_risk",
        title="Vulnerability & Risk",
        icon="bug_report",
        priority=2,
        match_metric=["vulnerability", "risk", "cve", "exploit", "score"],
        match_dimension=["asset", "endpoint", "host", "system", "severity"],
        match_type=["bar", "hbar"],
        match_title=["vulnerability", "risk", "cve", "exposure"],
    ),
    SectionRule(
        id="incident_response",
        title="Incident Response",
        icon="health_and_safety",
        priority=3,
        match_metric=["remediate", "mttr", "response", "resolution", "containment"],
        match_dimension=["severity", "team", "category", "incident_id"],
        match_type=["bar", "hbar", "line"],
        match_title=["response", "remediation", "resolution", "mttr"],
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
