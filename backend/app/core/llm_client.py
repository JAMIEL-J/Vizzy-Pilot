"""
Multi-provider LLM client with fallback support.

Belongs to: core layer
Responsibility: LLM API calls with retry and fallback
Restrictions: No business logic, returns raw responses only

Providers:
1. Groq (Primary)
2. Groq Fallback (Secondary)
"""

import json
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

import httpx

from app.core.config import get_settings
from app.core.logger import get_logger
from app.core.exceptions import InvalidOperation


logger = get_logger(__name__)


class LLMProvider(str, Enum):
    """Available LLM providers."""
    GROQ_DASHBOARD_NARRATIVE = "groq_dashboard_narrative"
    GROQ_CHAT_INSIGHT = "groq_chat_insight"
    GROQ_NARRATIVE = "groq_narrative"
    GROQ_CHAT = "groq_chat"


@dataclass
class LLMResponse:
    """Structured LLM response."""
    content: str
    provider: LLMProvider
    model: str
    usage: Optional[Dict[str, int]] = None


class LLMClient:
    """
    Multi-provider LLM client with automatic fallback.
    
    Usage:
        client = LLMClient()
        response = await client.complete(
            system_prompt="You are...",
            user_prompt="Classify this...",
            purpose="sql"
        )
    """

    def __init__(self):
        self.settings = get_settings().llm
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        import asyncio
        loop = asyncio.get_running_loop()
        
        # Check if we need to create or recreate the client
        should_recreate = (
            self._http_client is None or 
            self._http_client.is_closed or
            not hasattr(self, "_loop") or
            self._loop != loop
        )

        if should_recreate:
            if self._http_client and not self._http_client.is_closed:
                await self._http_client.aclose()
            
            self._http_client = httpx.AsyncClient(
                timeout=self.settings.timeout_seconds
            )
            self._loop = loop
            
        return self._http_client

    async def close(self) -> None:
        """Close HTTP client."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        """Rough token estimate for safety budgeting (provider-agnostic)."""
        return max(1, len(text) // 4)

    def _compress_prompts_for_payload(self, system_prompt: str, user_prompt: str, purpose: str) -> Tuple[str, str]:
        """
        Shrink prompts while preserving critical instruction and latest question context.

        Triggered only after provider returns HTTP 413.
        """
        # 413 means provider rejected the body size; enforce a hard, lower retry budget
        # rather than relying on environment token budgets which may still be too large.
        if purpose in {"sql", "chat"}:
            hard_cap = 5200
            min_cap = 2600
        else:
            hard_cap = 7000
            min_cap = 3200

        # Ensure we reduce materially on retry even for medium-size prompts.
        target_chars = min(hard_cap, max(min_cap, int(len(user_prompt) * 0.7)))
        if target_chars >= len(user_prompt):
            target_chars = max(min_cap, len(user_prompt) - 1200)

        def _shrink(text: str, limit: int, keep_tail: int = 1400) -> str:
            if len(text) <= limit:
                return text

            if keep_tail >= limit:
                keep_tail = max(256, limit // 3)

            head_budget = max(256, limit - keep_tail - 48)
            head = text[:head_budget]
            tail = text[-keep_tail:]
            return f"{head}\n\n...[truncated due to payload size]...\n\n{tail}"

        # Preserve SQL query section when present; trim schema/context first.
        if purpose in {"sql", "chat"} and "# User Query:" in user_prompt:
            query_marker = "# User Query:"
            i = user_prompt.find(query_marker)
            prefix = user_prompt[:i]
            suffix = user_prompt[i:]

            # Reserve most space for user query + instructions, trim schema prefix aggressively.
            if target_chars > 3000:
                suffix_budget = min(max(900, len(suffix)), target_chars - 900)
            else:
                suffix_budget = target_chars // 2
            prefix_budget = max(500, target_chars - suffix_budget)

            new_prefix = _shrink(prefix, prefix_budget, keep_tail=min(900, prefix_budget // 2))
            new_suffix = _shrink(suffix, suffix_budget, keep_tail=min(1200, suffix_budget // 2))
            compressed_user = f"{new_prefix}\n\n{new_suffix}"

            # Safety: if composition did not reduce enough, force-shrink to target.
            if len(compressed_user) >= len(user_prompt):
                compressed_user = _shrink(user_prompt, target_chars, keep_tail=min(1200, target_chars // 2))

            return _shrink(system_prompt, 2400), compressed_user

        return _shrink(system_prompt, 2400), _shrink(user_prompt, target_chars)

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        purpose: str = "narrative",
    ) -> LLMResponse:
        """
        Send completion request using Groq with internal fallback based on purpose.
        
        Purpose 'sql' or 'chat' uses the Groq chat/sql route first.
        Purpose 'dashboard_narrative' uses the dashboard Llama config.
        Purpose 'chat_insight' uses the chat-insight Llama config.
        Purpose 'narrative' (default) maps to dashboard narrative for backward compatibility.
        """
        temp = temperature if temperature is not None else self.settings.temperature
        tokens = max_tokens if max_tokens is not None else self.settings.max_tokens

        # Keep SQL/chat responses compact; JSON SQL plans do not need very large output budgets.
        if purpose in {"sql", "chat"}:
            tokens = min(tokens, int(self.settings.max_tokens_sql))

        effective_system_prompt = system_prompt
        effective_user_prompt = user_prompt

        logger.info(
            "LLM prompt size purpose=%s system_chars=%s user_chars=%s approx_input_tokens=%s",
            purpose,
            len(effective_system_prompt),
            len(effective_user_prompt),
            self._estimate_tokens(effective_system_prompt + effective_user_prompt),
        )

        if purpose in ["sql", "chat"]:
            # SQL/Chat Priority: groq_chat route first -> dashboard Llama fallback.
            providers = [
                (LLMProvider.GROQ_CHAT, self._call_groq_chat),
                (LLMProvider.GROQ_DASHBOARD_NARRATIVE, self._call_groq_dashboard_narrative),
            ]
        elif purpose == "chat_insight":
            # Chat insight priority: dedicated chat-insight Llama -> dashboard Llama (Fallback)
            providers = [
                (LLMProvider.GROQ_CHAT_INSIGHT, self._call_groq_chat_insight),
                (LLMProvider.GROQ_DASHBOARD_NARRATIVE, self._call_groq_dashboard_narrative),
            ]
        else:
            # Dashboard narrative priority: dashboard Llama -> chat-insight Llama (Fallback)
            providers = [
                (LLMProvider.GROQ_DASHBOARD_NARRATIVE, self._call_groq_dashboard_narrative),
                (LLMProvider.GROQ_CHAT_INSIGHT, self._call_groq_chat_insight),
            ]

        last_error: Optional[Exception] = None

        for provider, call_fn in providers:
            try:
                logger.info(f"Attempting LLM call with {provider.value} for purpose: {purpose}")
                response = await call_fn(
                    system_prompt=effective_system_prompt,
                    user_prompt=effective_user_prompt,
                    temperature=temp,
                    max_tokens=tokens,
                )
                logger.info(f"LLM call successful with {provider.value}")
                return response
            except Exception as e:
                # Retry once with compressed payload when provider rejects large request bodies.
                if isinstance(e, httpx.HTTPStatusError) and e.response is not None and e.response.status_code == 413:
                    logger.warning(
                        "LLM provider rejected payload as too large (413). Retrying with compressed prompts for provider=%s purpose=%s",
                        provider.value,
                        purpose,
                    )
                    try:
                        compressed_system, compressed_user = self._compress_prompts_for_payload(
                            effective_system_prompt,
                            effective_user_prompt,
                            purpose,
                        )
                        logger.info(
                            "Compressed prompt size provider=%s purpose=%s system_chars=%s user_chars=%s approx_input_tokens=%s",
                            provider.value,
                            purpose,
                            len(compressed_system),
                            len(compressed_user),
                            self._estimate_tokens(compressed_system + compressed_user),
                        )
                        response = await call_fn(
                            system_prompt=compressed_system,
                            user_prompt=compressed_user,
                            temperature=temp,
                            max_tokens=tokens,
                        )
                        logger.info(f"LLM call successful after payload compression with {provider.value}")
                        return response
                    except Exception as retry_e:
                        logger.error(
                            "Compressed retry failed with %s: %s",
                            provider.value,
                            retry_e,
                            exc_info=True,
                        )
                        last_error = retry_e
                        continue

                if isinstance(e, httpx.HTTPStatusError) and e.response is not None:
                    status_code = e.response.status_code
                    response_snippet = (e.response.text or "")[:500].replace("\n", " ").strip()
                    logger.error(
                        "LLM provider HTTP error provider=%s purpose=%s status=%s body=%s",
                        provider.value,
                        purpose,
                        status_code,
                        response_snippet,
                    )
                    if status_code == 404 and provider == LLMProvider.GROQ_CHAT:
                        logger.error(
                            "Likely Groq chat model unavailable for this key/account. configured_model=%s",
                            self.settings.groq_chat_model,
                        )

                logger.error(f"LLM call failed with {provider.value}: {e}", exc_info=True)
                last_error = e
                continue

        raise InvalidOperation(
            operation="llm_complete",
            reason=f"All LLM providers failed for purpose: {purpose}",
            details=str(last_error) if last_error else "Unknown error",
        )

    async def _call_groq_internal(
        self,
        api_key_str: str,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
        provider: LLMProvider,
    ) -> LLMResponse:
        """Internal helper for Groq API calls."""
        if not api_key_str:
            raise ValueError(f"API key missing for {provider.value}")

        url = "https://api.groq.com/openai/v1/chat/completions"
        client = await self._get_client()
        
        response = await client.post(
            url,
            headers={"Authorization": f"Bearer {api_key_str}"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        response.raise_for_status()
        data = response.json()

        content = data["choices"][0]["message"]["content"]
        return LLMResponse(
            content=content,
            provider=provider,
            model=model,
            usage=data.get("usage"),
        )

    async def _call_groq_dashboard_narrative(self, **kwargs) -> LLMResponse:
        """Call the dashboard narrative Llama config."""
        dashboard_key = self.settings.groq_dashboard_api_key.get_secret_value()
        final_key = dashboard_key if dashboard_key else self.settings.groq_api_key.get_secret_value()

        return await self._call_groq_internal(
            api_key_str=final_key,
            model=self.settings.groq_dashboard_model or self.settings.groq_model,
            provider=LLMProvider.GROQ_DASHBOARD_NARRATIVE,
            **kwargs,
        )

    async def _call_groq_chat_insight(self, **kwargs) -> LLMResponse:
        """Call the chat insight Llama config."""
        insight_key = self.settings.groq_chat_insight_api_key.get_secret_value()
        final_key = insight_key if insight_key else self.settings.groq_api_key.get_secret_value()

        return await self._call_groq_internal(
            api_key_str=final_key,
            model=self.settings.groq_chat_insight_model or self.settings.groq_model,
            provider=LLMProvider.GROQ_CHAT_INSIGHT,
            **kwargs,
        )

    async def _call_groq_narrative(self, **kwargs) -> LLMResponse:
        """Backward-compatible alias for dashboard narrative."""
        return await self._call_groq_dashboard_narrative(**kwargs)

    async def _call_groq_chat(self, **kwargs) -> LLMResponse:
        """Call alternate Groq chat/sql model."""
        # Fallback to Account 1 key if Account 2 key is not configured yet
        # (Though user says they are giving us another)
        chat_key = self.settings.groq_chat_api_key.get_secret_value()
        final_key = chat_key if chat_key else self.settings.groq_api_key.get_secret_value()
        
        return await self._call_groq_internal(
            api_key_str=final_key,
            model=self.settings.groq_chat_model,
            provider=LLMProvider.GROQ_CHAT,
            **kwargs,
        )





def parse_json_response(content: str) -> Dict[str, Any]:
    """
    Parse JSON from LLM response, handling markdown code blocks.
    """
    # Remove markdown code blocks if present
    content = content.strip()
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        raise InvalidOperation(
            operation="parse_json_response",
            reason="LLM response is not valid JSON",
            details=str(e),
        )


# Singleton instance
_llm_client: Optional[LLMClient] = None


def get_llm_client() -> LLMClient:
    """Get singleton LLM client instance."""
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client
