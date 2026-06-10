import pandas as pd
import pytest
from unittest.mock import patch

from app.services.analytics.executor import Executor
from app.services.analytics.db_engine import DBEngine
from app.services.llm.intent_schema import IntentType
from app.services.visualization.nl2sql_chart_builder import build_chart_from_nl2sql


@pytest.fixture
def mock_df():
    return pd.DataFrame({
        "category": ["A", "B", "A", "C", "B"],
        "sales": [100, 200, 150, 300, 250],
        "quantity": [1, 2, 1, 3, 2]
    })


@patch("app.services.llm.llm_router.LLMRouter.generate_sql")
@pytest.mark.asyncio
async def test_nl2sql_e2e_pipeline(mock_generate_sql, mock_df):
    """
    Test the full NL2SQL pipeline from generated SQL down to dashboard payload formatting.
    Verifies that LLM metadata (x_axis, y_axis, explanation) properly flows through
    the DuckDB executor and gets translated to a frontend-compatible chart format.
    """
    # 1. Mock the LLM output that SQLGenerator would normally return
    mock_generate_sql.return_value = {
        "sql": 'SELECT category, SUM(sales) as total_sales FROM df GROUP BY category ORDER BY total_sales DESC',
        "explanation": "Here are the total sales grouped by category.",
        "error": None,
        "x_axis": "category",
        "y_axis": "total_sales",
        "title": "Total Sales by Category",
        "chart_type": "bar"
    }

    # 2. Setup the DBEngine and Load Data
    db = DBEngine(":memory:")
    await db.load_dataframe("df", mock_df)

    # 3. Setup the Executor
    executor = Executor()

    # 4. Simulate the router executing a user query
    # The Executor calls LLMRouter.generate_sql internally
    query = "Show me total sales by category"
    payload = await executor.run_query(query, db, "df")

    # Validate Executor Output (DuckDB correctly queried and metadata preserved)
    assert payload["success"] is True
    assert "data" in payload
    assert len(payload["data"]) == 3  # Categories A, B, C
    assert payload["x_axis"] == "category"
    assert payload["y_axis"] == "total_sales"
    assert payload["title"] == "Total Sales by Category"
    assert payload["explanation"] == "Here are the total sales grouped by category."

    # Validate Data Sorting/Accuracy
    # Order should be B (450), C (300), A (250)
    assert payload["data"][0]["category"] == "B"
    assert float(payload["data"][0]["total_sales"]) == 450.0
    assert payload["data"][1]["category"] == "C"
    assert float(payload["data"][1]["total_sales"]) == 300.0
    assert payload["data"][2]["category"] == "A"
    assert float(payload["data"][2]["total_sales"]) == 250.0

    # 5. Pass Executor output to the NL2SQL chart builder
    chart_payload = build_chart_from_nl2sql(payload)

    # Validate format compatibility for the frontend
    assert "chart" in chart_payload
    assert "explanation" in chart_payload
    
    chart_widget = chart_payload["chart"]
    # Check that metadata mapped correctly to the UI schema
    assert chart_widget["title"] == "Total Sales by Category"
    assert chart_payload["explanation"]["detailed"] == "Here are the total sales grouped by category."
    assert chart_widget["type"] == "bar"
    
    # Check that the data is structured correctly for the frontend rows
    assert "rows" in chart_widget["data"]
    assert len(chart_widget["data"]["rows"]) == 3
    assert chart_widget["data"]["rows"][0]["category"] == "B"
    assert float(chart_widget["data"]["rows"][0]["total_sales"]) == 450.0


@patch("app.services.llm.llm_router.LLMRouter.generate_sql")
@pytest.mark.asyncio
async def test_nl2sql_pipeline_error_handling(mock_generate_sql, mock_df):
    """
    Test how the pipeline handles an LLM error or invalid generation.
    """
    # Fix: Ensure 'sql' is an empty string instead of None to avoid .strip() AttributeError
    mock_generate_sql.return_value = {
        "sql": "",
        "explanation": "I couldn't generate the SQL.",
        "error": "Failed to understand query"
    }

    db = DBEngine(":memory:")
    await db.load_dataframe("df", mock_df)
    
    executor = Executor()
    payload = await executor.run_query("Do something weird", db, "df")

    assert payload["success"] is False
    assert "error" in payload
    # The error message should ideally reflect that it failed to resolve
    assert "Failed to resolve data query" in payload["error"]
