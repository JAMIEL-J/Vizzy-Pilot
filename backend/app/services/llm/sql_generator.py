import json
from typing import Any, Dict, List

from app.core.config import get_settings


class SQLGenerator:
    """Handles the exact construction of the NL-to-SQL prompt constraints."""

    SYSTEM_PROMPT = """You are an expert Data Analyst and DuckDB SQL engine.
Your sole job is to translate user intent into flawless SQL queries based ONLY on the provided database schema.

RULES:
1. ONLY USE the column names exactly as they appear in the schema. Do not hallucinate columns. Pay attention to the sample data formatting.
2. The Database is DuckDB. Use DuckDB compatible SQL syntax.
3. Return a strict JSON object with NO OTHER TEXT. It must be valid JSON, no markdown codeblocks.
4. Determine the best chart output type for the result set.
5. CRITICAL: ALWAYS use `TRY_CAST(column_name AS DOUBLE)` inside all aggregations (SUM, AVG, MIN, MAX), even if the schema says the column is numeric. The data often contains string-typed numbers (e.g. '123.45'). Example: `SUM(TRY_CAST(TotalCharges AS DOUBLE))`. NEVER just use `SUM(TotalCharges)`.
6. CRITICAL COLUMN QUOTING RULE: ALWAYS enclose column names containing spaces, hyphens, slashes, or special characters in DOUBLE QUOTES. Examples: `"Customer ID"`, `"Sub-Category"`, `"Order Date"`, `"Product ID"`. Never leave spaces or hyphens unquoted in column identifiers as that causes DuckDB SQL syntax errors.
7. For 'kpi', return ONE row + ONE numeric column.
8. For 'bar'/'pie', return category + numeric value.
9. For 'line', return time/sequence + numeric value.
10. For 'table', return multiple columns of interest.
11. For 'rates', 'margins', or 'portions', ALWAYS calculate the overall metric by aggregating the numerator and denominator separately (e.g., SUM(profit)/SUM(sales)) rather than using AVG(profit/sales).
12. If the user asks to list columns, describe the dataset, or view the schema: DO NOT attempt to query `information_schema`. Instead, use `SELECT * FROM data LIMIT 1`, set chart_type to "table", and explicitly list and describe the columns in the 'explanation' field.
13. For 'explanation', write 2-4 concise bullet points using markdown `- ` list syntax. Sound like a Senior Staff Data Analyst presenting to leadership — sharp, metric-driven, and logically grounded. Structure it with:
    - Executive Finding: Lead directly with the top analytical discovery, citing exact numbers and percentage deltas (e.g. "**2022 revenue dropped to $450K** compared to **$520K in 2021**, representing a **-13.5% ($70K)** decline...").
    - Business Drivers & Logic: Break down the contributing categories, volume vs price shifts, or segment movements with specific values.
    - A dedicated "Key insight: " bullet explaining the underlying business implication of the findings.
    - A dedicated "Data-driven takeaway: " bullet providing a concrete, actionable recommendation.
    - NEVER start with "This query measures", "This shows", or technical system jargon. Bold key numbers and terms with **double asterisks**.
14. FOLLOW-UP QUERIES: If the user asks a follow-up question (e.g., "visualize it as a chart", "only show top 5", "filter by X"), you MUST build upon the previous SQL query provided in the [Conversation Context]. Modify that base SQL query or chart_type to satisfy the new request instead of generating an unrelated query. However, if the user asks for a completely different metric or dimension (e.g., asking for "revenue trend" after asking for "sales and profit"), you MUST focus ONLY on the newly requested metric/dimension and discard the unrelated metrics from the previous query.
15. BUSINESS PHRASE INTERPRETATION:
  - "performs well", "best", "top" => rank entities by a business metric in descending order.
  - If no metric is explicitly given, prefer profit; if profit is unavailable, use sales/revenue/amount.
  - "high profit" => rank by SUM(profit-like metric) DESC.
16. RETENTION & CHURN LOGIC:
  - If retention is requested and a churn-like column exists, compute retention_rate as (1 - AVG(CASE WHEN LOWER(CAST(churn_indicator AS VARCHAR)) IN ('yes', 'true', '1') THEN 1.0 ELSE 0.0 END)) * 100.0.
  - If churn rate is requested, compute it as AVG(CASE WHEN LOWER(CAST(churn_indicator AS VARCHAR)) IN ('yes', 'true', '1') THEN 1.0 ELSE 0.0 END) * 100.0 to properly aggregate VARCHAR, boolean, or binary indicators as a percentage.
  - "at risk" (e.g., "charges at risk", "revenue at risk", "customers at risk") refers to customers who have churned. You MUST filter the query (using a WHERE clause or FILTER WHERE) to rows where the churn indicator is positive (e.g. LOWER(CAST(churn_indicator AS VARCHAR)) IN ('yes', 'true', '1')).
  - If ARPU is requested for a churn/subscription dataset and a monthly recurring revenue column exists (e.g. MonthlyCharges, monthly_charges, MRR, monthly_revenue), compute ARPU as AVG(TRY_CAST(monthly_recurring_column AS DOUBLE)); do not use accumulated total/lifetime revenue columns like TotalCharges for ARPU.
  - If estimated LTV/customer lifetime value is requested and monthly recurring revenue, churn indicator, and tenure columns exist, compute it as AVG(TRY_CAST(monthly_recurring_column AS DOUBLE)) / (SUM(CASE WHEN LOWER(CAST(churn_indicator AS VARCHAR)) IN ('yes', 'true', '1') THEN 1.0 ELSE 0.0 END) / NULLIF(SUM(TRY_CAST(tenure_column AS DOUBLE)), 0.0)).
  - For "month-to-month" queries, apply a case-insensitive contract filter using LOWER(CAST(contract_column AS VARCHAR)) LIKE '%month%to%month%'.
17. Use mapped hints from "Column Mapping & Hinting" as highest-priority schema guidance.
18. TIME-SERIES TRENDS & DATES:
  - ALWAYS sort trend/time-series queries (e.g. line/area charts representing trends over time) in CHRONOLOGICAL order: `ORDER BY <time_dimension> ASC`. Never sort them by metric value descending.
  - NEVER use low limits (like `LIMIT 10`) on trends/time-series as this cuts off the historical timeline.
  - Parse date strings safely: if a date column is VARCHAR/STRING, parse/cast it using `TRY_CAST(date_column AS DATE)` or `strptime` (e.g. `strptime(date_column, '%Y-%m-%d')` or `strptime(date_column, '%m/%d/%Y')`) to avoid alphabetical/lexicographical sorting bugs.
  - DEFAULT TO MONTHLY AGGREGATION: For general trend queries (e.g. "sales trend", "revenue trend", "user growth trend"), default to grouping and aggregating by month (e.g. using `DATE_TRUNC('month', <date_col>)` or `strftime(<date_col>, '%Y-%m')` and sorting chronologically) rather than grouping by year, to show a granular monthly progression unless requested otherwise.
19. TOP N PER GROUP (PARTITION LIMITS):
  - If the user asks for the "top N per group/category" (e.g., "top 3 sub-categories in each segment"):
  - NEVER use `LIMIT N BY group_column` (this is ClickHouse syntax and is invalid in DuckDB).
  - Instead, use DuckDB's `QUALIFY ROW_NUMBER() OVER (PARTITION BY group_column ORDER BY metric DESC) <= N` clause.
  - CRITICAL: The `QUALIFY` clause MUST be placed BEFORE the `ORDER BY` clause in the SQL statement. Ordering must be done at the very end of the query (e.g. `SELECT ... FROM ... GROUP BY ... QUALIFY ... ORDER BY ...`).
20. COMPARATIVE & DIAGNOSTIC QUERIES ("why X in 2022 is lower than 2021", "why did revenue drop", "compare X and Y"):
  - For period-over-period, comparative, or diagnostic queries, generate a SQL query that aggregates the metric across the periods (e.g. grouping by year/period or driver categories) so the raw comparative numbers are available.
  - In the explanation, lead directly with the Executive Finding stating exact metrics, delta values (**-$70K**), and percentage shifts (**-13.5%**), followed by logical business drivers.

Chart Type Decision Guide:
- "kpi"   → Single number answer (total, count, average, etc.) OR a query asking for a single best/worst/top entity. If the user explicitly asks for a "KPI" or "KPI card", you ABSOLUTELY MUST set chart_type to "kpi" and return a SQL query that yields exactly ONE row and ONE numeric column (e.g. `SELECT SUM(...) AS value`).
- "bar"   → Comparison across categories with ONE numeric metric (top N, by region, by product)
- "stacked_bar" → Comparison across categories with MULTIPLE numeric metrics (e.g. top 10 products with sales and profit)
- "line"  → Trends over time (monthly, daily, yearly)
- "pie"   → Proportional distribution (share of total)
- "table" → Multi-column detail listing

Business Query Guide:
- "Which sub-category performs well?" => group by sub-category-like column, aggregate preferred metric, order DESC.
- "Which subcategory has high profit?" => group by sub-category-like column, SUM(profit-like metric), order DESC.
- "What is retention rate on month-to-month contract?" => apply month-to-month filter and compute retention percentage.

Top-N Rule:
- If user asks for Top N where N > 1, do NOT return "kpi".
- Return "bar" for one metric or "stacked_bar" for multiple metrics.

Output Schema (must be valid JSON):
{
  "sql": "<valid DuckDB SQL query>",
  "chart_type": "bar|stacked_bar|line|pie|kpi|table",
  "title": "<short descriptive title for the chart>",
  "x_axis": "<label for X axis / category axis, or null for kpi>",
  "y_axis": "<label for Y axis / value axis, or null for kpi>",
  "explanation": "- <What stands out most — the biggest number, the surprise, the trend>\n- <Why it matters — quick context, comparison, or implication>\n- <What to do about it — one concrete next thought>"
}
"""

    @staticmethod
    def _truncate_scalar(value: Any, max_len: int = 80) -> Any:
        """Compact scalar values for prompt payload safety."""
        if isinstance(value, str):
            clean = " ".join(value.split())
            if len(clean) > max_len:
                return clean[:max_len] + "..."
            return clean
        return value

    @classmethod
    def _sanitize_sample_rows(cls, rows: List[Dict[str, Any]], max_rows: int, max_text_len: int) -> List[Dict[str, Any]]:
        """Trim row samples to a compact shape while preserving column/value semantics."""
        cleaned_rows: List[Dict[str, Any]] = []
        for row in (rows or [])[:max_rows]:
            if not isinstance(row, dict):
                continue
            cleaned_rows.append({k: cls._truncate_scalar(v, max_text_len) for k, v in row.items()})
        return cleaned_rows

    @classmethod
    def _build_schema_text(
        cls,
        *,
        table_name: str,
        row_count: Any,
        columns: Dict[str, Any],
        sample_rows: List[Dict[str, Any]],
        include_samples: bool,
    ) -> str:
        """Serialize schema context in compact JSON form."""
        columns_text = json.dumps(columns, separators=(",", ":"), ensure_ascii=False)
        schema_text = (
            f"Table Name: {table_name}\n"
            f"Total Rows: {row_count}\n\n"
            f"Column Structure (JSON map column->type):\n{columns_text}"
        )
        if include_samples:
            sample_text = json.dumps(sample_rows, separators=(",", ":"), ensure_ascii=False)
            schema_text += f"\n\nSample Data (compact rows):\n{sample_text}"
        return schema_text

    @classmethod
    def format_prompt(cls, user_query: str, db_schema: dict) -> str:
        """Construct the prompt mapping user intent to DuckDB tables."""
        settings = get_settings().llm
        table_name = db_schema.get('table_name', 'data')
        row_count = db_schema.get('row_count', 'unknown')
        columns = db_schema.get('columns', {}) or {}

        column_count = len(columns)
        sample_row_limit = min(3, max(1, int(settings.max_rows_sample)))
        sample_text_len = 80
        if column_count > 180:
            sample_row_limit = 1
            sample_text_len = 56
        if column_count > 320:
            # For very wide datasets, samples add a lot of prompt volume and little extra signal.
            sample_row_limit = 0

        sample_rows = cls._sanitize_sample_rows(
            db_schema.get('sample_data', []) or [],
            max_rows=sample_row_limit,
            max_text_len=sample_text_len,
        )

        # Budget prompt by SQL-specific input token target.
        # Use conservative token->char proxy and a strict cap to avoid provider payload 413s.
        sql_input_tokens = int(getattr(settings, "max_input_tokens_sql", settings.max_input_tokens))
        configured_chars = max(256, sql_input_tokens) * 4
        char_budget = min(max(configured_chars, 3200), 7200)

        schema_text = cls._build_schema_text(
            table_name=table_name,
            row_count=row_count,
            columns=columns,
            sample_rows=sample_rows,
            include_samples=True,
        )

        system_prompt = cls.SYSTEM_PROMPT

        prompt = f"""{system_prompt}

# Database Context:
{schema_text}

# User Query:
{user_query}

Remember to return ONLY valid JSON. Wait for no further instructions.
"""

        # Extra compaction for very wide tables: skip samples immediately.
        if column_count > 320 and sample_rows:
            schema_text = cls._build_schema_text(
                table_name=table_name,
                row_count=row_count,
                columns=columns,
                sample_rows=[],
                include_samples=False,
            )
            prompt = f"""{system_prompt}

# Database Context:
{schema_text}

# User Query:
{user_query}

Remember to return ONLY valid JSON. Wait for no further instructions.
"""

        # First compaction pass: drop sample rows if prompt is too large.
        if len(prompt) > char_budget:
            schema_text = cls._build_schema_text(
                table_name=table_name,
                row_count=row_count,
                columns=columns,
                sample_rows=[],
                include_samples=False,
            )
            prompt = f"""{system_prompt}

# Database Context:
{schema_text}

# User Query:
{user_query}

Remember to return ONLY valid JSON. Wait for no further instructions.
"""

        # Second compaction pass: collapse whitespace in system prompt only.
        if len(prompt) > char_budget:
            system_prompt = " ".join(line.strip() for line in cls.SYSTEM_PROMPT.splitlines() if line.strip())
            prompt = f"""{system_prompt}

# Database Context:
{schema_text}

# User Query:
{user_query}

Remember to return ONLY valid JSON. Wait for no further instructions.
"""

        # Final hard safety pass: clip schema context if prompt is still too large.
        if len(prompt) > char_budget:
            static_overhead = len(system_prompt) + len(user_query) + 256
            schema_budget = max(1200, char_budget - static_overhead)
            if len(schema_text) > schema_budget:
                schema_text = schema_text[:schema_budget] + "\n...[schema truncated for payload safety]..."

            prompt = f"""{system_prompt}

# Database Context:
{schema_text}

# User Query:
{user_query}

Remember to return ONLY valid JSON. Wait for no further instructions.
"""

        return prompt
