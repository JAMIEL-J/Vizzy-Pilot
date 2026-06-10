import pytest
import asyncio
from unittest.mock import AsyncMock, patch
from app.services.llm.llm_router import LLMRouter
from app.services.llm.memory_manager import MemoryManager

import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.llm.llm_router import LLMRouter
from app.services.llm.memory_manager import MemoryManager
from app.core.llm_client import LLMResponse, LLMProvider

import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from app.core.llm_client import LLMClient, LLMResponse, LLMProvider
from app.services.llm.memory_manager import MemoryManager

@pytest.mark.asyncio
async def test_llm_client_fallback():
    """Test that LLMClient falls back to secondary provider if primary fails."""
    client = LLMClient()
    
    # We need to mock the internal provider call methods
    # For purpose="sql", providers are [GROQ_CHAT, GROQ_DASHBOARD_NARRATIVE]
    with patch.object(client, '_call_groq_chat', side_effect=Exception("Groq Chat Failed")), \
         patch.object(client, '_call_groq_dashboard_narrative', new_callable=AsyncMock) as mock_fallback:
        
        mock_fallback.return_value = LLMResponse(
            content='{"sql": "SELECT 1"}', 
            provider=LLMProvider.GROQ_DASHBOARD_NARRATIVE, 
            model="llama-3"
        )
        
        response = await client.complete(
            system_prompt="sys", 
            user_prompt="user", 
            purpose="sql"
        )
        
        assert response.provider == LLMProvider.GROQ_DASHBOARD_NARRATIVE
        assert "SELECT 1" in response.content
        mock_fallback.assert_called_once()

@pytest.mark.asyncio
async def test_llm_client_timeout_fallback():
    """Test that LLMClient handles timeouts by falling back."""
    client = LLMClient()
    
    with patch.object(client, '_call_groq_chat', side_effect=asyncio.TimeoutError("Timeout")), \
         patch.object(client, '_call_groq_dashboard_narrative', new_callable=AsyncMock) as mock_fallback:
        
        mock_fallback.return_value = LLMResponse(
            content='{"sql": "SELECT 2"}', 
            provider=LLMProvider.GROQ_DASHBOARD_NARRATIVE, 
            model="llama-3"
        )
        
        response = await client.complete(
            system_prompt="sys", 
            user_prompt="user", 
            purpose="sql"
        )
        
        assert response.provider == LLMProvider.GROQ_DASHBOARD_NARRATIVE
        assert "SELECT 2" in response.content
        mock_fallback.assert_called_once()


@pytest.mark.asyncio
async def test_memory_manager_summarization():
    """Test that memory manager triggers summarization when token limit is exceeded."""
    memory = MemoryManager()
    memory.MAX_TOKENS = 50  # Artificially low for testing
    
    messages = [
        {"role": "user", "content": "Help me with my sales data please."},
        {"role": "assistant", "content": "I can help with that. What metrics do you want?"},
        {"role": "user", "content": "Show me total revenue by region for last year."},
        {"role": "assistant", "content": "Sure, here is the bar chart for revenue by region."},
        {"role": "user", "content": "Now filter it for the West region only."}
    ]
    
    # Verify it should summarize
    assert memory.should_summarize(messages) == True
    
    # Mock the router for summarization
    with patch('app.services.llm.llm_router.LLMRouter.generate_response', new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = "The user asked for sales data and filtered revenue by region."
        
        summarized = await memory.summarize(messages)
        
        # Should keep KEEP_RECENT (4) messages plus one summary message
        assert len(summarized) == 5 
        assert summarized[0]["role"] == "system"
        assert "[Conversation Summary]" in summarized[0]["content"]

if __name__ == "__main__":
    asyncio.run(test_llm_router_fallback())
    asyncio.run(test_llm_router_timeout())
    asyncio.run(test_memory_manager_summarization())
