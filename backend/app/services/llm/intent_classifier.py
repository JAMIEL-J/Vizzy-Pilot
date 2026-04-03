"""
Intent classifier module.

Belongs to: LLM services layer
Responsibility: Classify user queries into structured intents using LLM
Restrictions: Returns validated AnalysisIntent only
"""

import re
from typing import Dict, Any

from app.core.llm_client import get_llm_client, parse_json_response
from app.core.logger import get_logger
from app.services.llm.intent_schema import AnalysisIntent, IntentType, Aggregation


logger = get_logger(__name__)


# Keywords that indicate user wants a visualization/chart
VISUALIZATION_KEYWORDS = [
    # Action words
    "show", "show me", "display", "visualize", "plot", "graph", "chart",
    "create", "create a", "generate", "draw", "render", "build",
    # Chart type words
    "bar chart", "line chart", "pie chart", "histogram", "scatter",
    "heatmap", "treemap", "funnel", "gauge", "map",
    # Visual phrases
    "give me a chart", "make a graph", "visually", "visualization",
    "breakdown", "distribution", "compare visually", "trend chart",
    # Dashboard triggers
    "dashboard", "overview", "summary dashboard", "report",
]

# Keywords that indicate text-only response (no chart)
TEXT_QUERY_KEYWORDS = [
    # Question words
    "what is", "what's", "how many", "how much", "tell me",
    "explain", "describe", "define", "summarize", "list",
    # Information requests
    "total", "average", "count", "minimum", "maximum", "sum",
    "mean", "median", "percentage", "ratio", "difference",
    # Descriptive queries
    "why", "when", "which", "who", "where",
    "about", "regarding", "concerning",
]


def _detect_visualization_intent(query: str) -> bool:
    """
    Detect if query requires a visualization based on keywords.
    
    Returns True if visualization keywords are found.
    """
    query_lower = query.lower()
    
    for keyword in VISUALIZATION_KEYWORDS:
        if keyword in query_lower:
            return True
    
    return False


def _detect_dashboard_intent(query: str) -> bool:
    """Detect if query asks for a dashboard/overview."""
    dashboard_keywords = ["dashboard", "overview", "summary", "report", "all metrics"]
    query_lower = query.lower()
    
    for keyword in dashboard_keywords:
        if keyword in query_lower:
            return True
    
    return False


# System prompt for intent classification
INTENT_CLASSIFICATION_SYSTEM_PROMPT = """
You are a production-grade analytical intent classifier for a BI copilot.

Your job is to classify user queries into one of 6 intent types:

1. "retrieval" = User wants a SINGLE NUMBER or a simple lookup
   - "What is the total revenue?"
   - "How many customers churned?"
   - "List the top 5 products"

2. "comparative" = User wants to COMPARE values across categories
   - "Compare sales by region"
   - "Show revenue vs expenses"
   - "Top 10 cities by revenue"

3. "aggregative" = User wants a GROUPED metric with specific aggregation
   - "Average tenure by contract type"
   - "Sum of charges per payment method"
   - "Count orders by month"

4. "trend" = User wants to see change OVER TIME
   - "Revenue trend by month"
   - "How has churn changed over time?"
   - "Monthly growth in signups"

5. "interpretive" = User wants to UNDERSTAND WHY something is happening
   - "Why is churn so high?"
   - "What drives revenue?"
   - "Explain the drop in sales"

6. "ambiguous" = Query is unclear, column reference is vague, or multiple interpretations exist
   - "Show me top customers" (top by what?)
   - "Analyze the data" (too broad)
   - "What about performance?" (which metric?)

Rules:
- Do NOT guess column names - use exact names from schema
- Time/Date components (like year, month, date) MUST ONLY be used in 'group_by' or 'time_column', NEVER as the 'metric'
- Financial/Numeric values (revenue, sales, count) MUST be the 'metric', NEVER in 'group_by'
- If a time-related word is used (monthly, yearly, trend, over time), classify as "trend"
- If user asks "why" or "what drives" or "explain", classify as "interpretive"
- If user asks to "compare" or uses "by" with a dimension, classify as "comparative"
- Only use "ambiguous" when genuinely unclear
- Always return valid JSON

Output format:
{
  "intent_type": "retrieval" | "comparative" | "aggregative" | "trend" | "interpretive" | "ambiguous",
  "aggregation": "count" | "sum" | "average" | "min" | "max" | null,
  "metric": "<column_name>" | null,
  "group_by": ["<column_name>"] | null,
  "time_column": "<column_name>" | null,
  "time_granularity": "day" | "week" | "month" | "year" | null
}
"""


def build_user_prompt(query: str, schema: Dict[str, Any]) -> str:
    """Build user prompt with query and schema context."""
    schema_str = "\n".join([
        f"- {col['name']}: {col['dtype']}"
        for col in schema.get("columns", [])
    ]) if schema else "No schema available"

    return f"""
User Query:
{query}

Dataset Schema:
{schema_str}

Return ONLY the JSON object, no explanations.
"""


async def classify_intent(
    query: str,
    schema: Dict[str, Any],
) -> AnalysisIntent:
    """
    Classify user query into structured AnalysisIntent.
    
    Strategy: Use fast heuristic as primary signal, LLM for structured extraction.
    The heuristic decides the intent_type, the LLM extracts metric/group_by/etc.
    """
    # Step 1: Fast heuristic for intent type (zero cost)
    fast_intent, fast_confidence, fast_label = classify_intent_fast(query)
    logger.info(f"Fast classifier: {fast_label} (confidence: {fast_confidence})")

    # Map fast heuristic to IntentType enum
    FAST_TO_INTENT = {
        'kpi': 'retrieval',
        'comparison': 'comparative',
        'trend': 'trend',
        'distribution': 'comparative',  # distributions are visual comparisons
        'exploration': 'retrieval',
        'dashboard': 'retrieval',       # dashboard handled separately upstream
        'aggregative': 'aggregative',
    }

    # Detect interpretive ("why" questions) — not in fast classifier
    query_lower = query.lower().strip()
    # Normalize query for better matching
    normalized_query = re.sub(r'[^\w\s]', '', query_lower)
    is_interpretive = any(re.search(fr'\b{p}\b', normalized_query) for p in [
        'why', 'what drives', 'what causes', 'explain the', 'reason for',
        'what led to', 'what is behind', 'root cause', 'factors behind',
    ])

    if is_interpretive:
        heuristic_type = 'interpretive'
    elif fast_confidence < 0.4:
        heuristic_type = 'ambiguous'
    else:
        heuristic_type = FAST_TO_INTENT.get(fast_intent, 'retrieval')

    # Step 2: LLM for structured field extraction
    client = get_llm_client()
    user_prompt = build_user_prompt(query, schema)

    try:
        response = await client.complete(
            system_prompt=INTENT_CLASSIFICATION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.0,
            purpose="chat",
        )
        content_snippet = (response.content or "")[:100]
        logger.info(f"LLM response from {response.provider.value}: {content_snippet}...")
        data = parse_json_response(response.content)
    except Exception as e:
        logger.warning(f"LLM classification failed, using heuristic only: {e}")
        data = {}

    # Step 3: Merge — heuristic wins for chart-like structure; LLM wins for fields
    llm_type = data.get('intent_type', heuristic_type)

    has_visual_signal = _detect_visualization_intent(query)
    has_structured_analytic_signal = bool(re.search(
        r"\b(by|where|group by|higher than|greater than|more than|less than|top\s+\d+|filter)\b",
        query_lower,
    ))

    # Trust LLM for interpretive, and for truly ambiguous low-signal queries.
    # But if user clearly asks for a visualization/structured analytic, keep heuristic route.
    if llm_type == 'interpretive':
        final_type = llm_type
    elif llm_type == 'ambiguous':
        if (
            has_visual_signal
            or has_structured_analytic_signal
            or heuristic_type in ('comparative', 'aggregative', 'trend')
        ):
            final_type = heuristic_type
        else:
            final_type = llm_type
    else:
        final_type = heuristic_type

    # Handle null aggregation
    if data.get('aggregation') is None:
        data['aggregation'] = 'count'

    intent = AnalysisIntent(
        intent_type=IntentType(final_type),
        aggregation=Aggregation(data.get('aggregation', 'count')),
        metric=data.get('metric'),
        group_by=data.get('group_by'),
        time_column=data.get('time_column'),
        time_granularity=data.get('time_granularity'),
    )

    logger.info(f"Final intent: {intent.intent_type.value} (heuristic={heuristic_type}, llm={llm_type})")
    return intent


# =============================================================================
# Fast Heuristic Classifier (No LLM cost)
# =============================================================================

_FAST_DASHBOARD = [
    r'\bdashboard\b', r'\boverview\b', r'\bsummary\s+dashboard\b',
    r'\breport\b', r'\ball\s+metrics\b', r'\bfull\s+analysis\b',
]
_FAST_KPI = [
    r'\btotal\b', r'\bhow\s+many\b', r'\bhow\s+much\b',
    r'\bcount\b', r'\baverage\b', r'\bmean\b', r'\bmedian\b',
    r'\bmax(?:imum)?\b', r'\bmin(?:imum)?\b', r'\bsum\b',
    r'\bwhat\s+is\s+the\b', r'\bwhat\'s\s+the\b',
]
_FAST_TREND = [
    r'\btrend\b', r'\bover\s+time\b', r'\bmonthly\b', r'\bdaily\b',
    r'\bweekly\b', r'\byearly\b', r'\bannual\b', r'\bquarterly\b',
    r'\bgrowth\b', r'\bchange\s+over\b', r'\bhistor(?:y|ical)\b',
    r'\btime\s+series\b',
]
_FAST_COMPARISON = [
    r'\bcompare\b', r'\bvs\.?\b', r'\bversus\b', r'\bby\s+\w+\b',
    r'\bacross\b', r'\bper\s+\w+\b', r'\bgroup(?:ed)?\s+by\b',
    r'\bbetween\b', r'\btop\s+\d+\b', r'\bbottom\s+\d+\b',
    r'\bhighest\b', r'\blowest\b', r'\branking\b', r'\bbest\b', r'\bworst\b',
]
_FAST_DISTRIBUTION = [
    r'\bdistribution\b', r'\bproportion\b', r'\bshare\b',
    r'\bpercentage\b', r'\bcomposition\b', r'\bratio\b',
    r'\bsplit\b', r'\bmix\b', r'\bsegment\b', r'\bbreakdown\b',
]
_FAST_EXPLORATION = [
    r'\bshow\s+me\b', r'\blist\b', r'\bdetails?\b',
    r'\brecords?\b', r'\brows?\b', r'\bexplore\b',
    r'\blook\s+at\b', r'\bfind\b', r'\bwhere\b', r'\bfilter\b',
]

FAST_INTENT_LABELS = {
    'kpi': '🎯 KPI',
    'comparison': '📊 Comparison',
    'trend': '📈 Trend',
    'distribution': '🍩 Distribution',
    'exploration': '🔍 Exploration',
    'dashboard': '📋 Dashboard',
}


def _fast_score(query: str, patterns: list) -> float:
    return sum(1 for p in patterns if re.search(p, query))


def classify_intent_fast(query: str) -> tuple:
    """
    Zero-cost heuristic intent classifier. Returns (intent, confidence, label).

    Used in chat_routes.py to avoid an LLM call for intent detection.
    """
    q = query.lower().strip()

    scores = {
        'dashboard': _fast_score(q, _FAST_DASHBOARD),
        'kpi': _fast_score(q, _FAST_KPI),
        'trend': _fast_score(q, _FAST_TREND),
        'comparison': _fast_score(q, _FAST_COMPARISON),
        'distribution': _fast_score(q, _FAST_DISTRIBUTION),
        'exploration': _fast_score(q, _FAST_EXPLORATION),
    }

    # Boost short KPI queries
    if len(q.split()) <= 8 and scores['kpi'] > 0:
        scores['kpi'] *= 1.5
    # Boost "by X" → comparison
    if re.search(r'\bby\s+\w+', q):
        scores['comparison'] *= 1.3
    # Boost time words → trend
    if re.search(r'\b(month|year|week|day|quarter|date)\b', q):
        scores['trend'] *= 1.4

    best = max(scores, key=scores.get)
    best_score = scores[best]

    if best_score == 0:
        return ('exploration', 0.3, FAST_INTENT_LABELS['exploration'])

    confidence = min(best_score / 3.0, 1.0)
    return (best, round(confidence, 2), FAST_INTENT_LABELS[best])

