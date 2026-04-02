import json
import logging
from typing import Dict, Any, Union

from app.core.llm_client import get_llm_client

logger = logging.getLogger(__name__)

class LLMRouter:
    """
    Router for Chat Analytics / SQL generation.
    Uses the 'sql' purpose with the LLMClient SQL/chat provider chain.
    """
    def __init__(self):
        self.client = get_llm_client()

    async def generate_sql(self, prompt: str, schema: str) -> Dict[str, Any]:
        """
        Specialized method for SQL generation.
        """
        return await self.generate_response(prompt, json_mode=True)

    async def generate_response(self, prompt: str, json_mode: bool = True) -> Union[Dict[str, Any], str]:
        """
        Generate a response via LLMClient with 'sql' purpose.
        """
        try:
            logger.info("Attempting LLM generation for Chat/SQL purpose")
            # We use the unified LLMClient which handles fallbacks internally
            response = await self.client.complete(
                system_prompt="You are an expert data analyst and DuckDB SQL generator.",
                user_prompt=prompt,
                purpose="sql"
            )
            
            content = response.content
            return self._parse_json(content) if json_mode else content
            
        except Exception as e:
            logger.error(f"LLM generation failed: {str(e)}")
            raise e

    def _parse_json(self, response_text: str) -> dict:
        # Failsafe cleaner for possible markdown block leakage
        cleaned = response_text.replace("```json", "").replace("```", "").strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            # Fallback attempt: if it's not JSON, maybe it's text wrapped in one
            if not cleaned.startswith("{"):
                return {"text": cleaned}
            raise ValueError(f"LLM returned invalid JSON: {cleaned[:100]}...")
