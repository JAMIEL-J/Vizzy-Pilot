import pytest
from unittest.mock import AsyncMock, patch
from app.services.llm.suggestion_generator import generate_contextual_suggestions

@pytest.mark.asyncio
async def test_generate_contextual_suggestions_basic():
    # Setup test inputs
    schema = {
        "allowed_metrics": {"metrics": ["sales", "profit"]},
        "allowed_dimensions": {"dimensions": ["region", "category"]},
        "target_column": "churn"
    }
    history = [
        {"role": "user", "content": "What is total sales?"},
        {"role": "assistant", "content": "Total sales is $1,000."}
    ]
    latest_result = {
        "type": "nl2sql",
        "sql": "SELECT SUM(sales) FROM data"
    }

    # Mock the LLMRouter
    mock_router_instance = AsyncMock()
    mock_router_instance.generate_response.return_value = ["Show sales by region", "Compare profit by category"]

    with patch("app.services.llm.suggestion_generator.LLMRouter", return_value=mock_router_instance):
        suggestions = await generate_contextual_suggestions(
            schema=schema,
            conversation_history=history,
            latest_result=latest_result
        )

        assert len(suggestions) == 2
        assert suggestions[0] == "Show sales by region"
        assert suggestions[1] == "Compare profit by category"
        mock_router_instance.generate_response.assert_called_once()


@pytest.mark.asyncio
async def test_generate_contextual_suggestions_dict_response():
    schema = {
        "allowed_metrics": {"metrics": ["sales"]},
        "allowed_dimensions": {"dimensions": ["region"]},
    }
    
    mock_router_instance = AsyncMock()
    mock_router_instance.generate_response.return_value = {
        "suggestions": ["What is total sales by region?", "Compare sales"]
    }

    with patch("app.services.llm.suggestion_generator.LLMRouter", return_value=mock_router_instance):
        suggestions = await generate_contextual_suggestions(
            schema=schema,
            conversation_history=[]
        )

        assert len(suggestions) == 2
        assert suggestions[0] == "What is total sales by region?"


@pytest.mark.asyncio
async def test_generate_contextual_suggestions_fallback_on_exception():
    schema = {
        "allowed_metrics": {"metrics": ["sales"]},
        "allowed_dimensions": {"dimensions": ["region"]},
    }
    
    mock_router_instance = AsyncMock()
    mock_router_instance.generate_response.side_effect = Exception("API Error")

    with patch("app.services.llm.suggestion_generator.LLMRouter", return_value=mock_router_instance):
        suggestions = await generate_contextual_suggestions(
            schema=schema,
            conversation_history=[]
        )

        # Should fallback to metric-based suggestions
        assert len(suggestions) > 0
        assert "sales" in suggestions[0].lower() or "region" in suggestions[0].lower()
