"""
OpenAI-compatible LLM service.
Works with Groq, OpenAI, OpenRouter, Together, and any provider using /chat/completions.
"""

import json
from typing import Optional, AsyncGenerator

import httpx
from loguru import logger

from app.config import settings


class OpenAICompatibleService:
    """LLM service for OpenAI-compatible chat completion APIs."""

    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.base_url = settings.OPENAI_BASE_URL.rstrip("/")
        self.model = settings.LLM_MODEL

        if not self.api_key:
            logger.warning("OPENAI_API_KEY is empty.")

        if not self.base_url:
            logger.warning("OPENAI_BASE_URL is empty.")

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = None,
        max_tokens: int = None,
    ) -> str:
        """Generate a non-streaming response."""
        messages = []

        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt,
            })

        messages.append({
            "role": "user",
            "content": prompt,
        })

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature if temperature is not None else settings.LLM_TEMPERATURE,
            "max_tokens": max_tokens if max_tokens is not None else settings.LLM_MAX_TOKENS,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        url = f"{self.base_url}/chat/completions"

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                url,
                headers=headers,
                json=payload,
            )

            if response.status_code >= 400:
                logger.error(f"OpenAI-compatible API error {response.status_code}: {response.text}")
                response.raise_for_status()

            data = response.json()

        try:
            return data["choices"][0]["message"]["content"]
        except Exception:
            logger.error(f"Unexpected OpenAI-compatible response: {data}")
            raise

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = None,
        max_tokens: int = None,
    ) -> AsyncGenerator[str, None]:
        """Generate a streaming response."""
        messages = []

        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt,
            })

        messages.append({
            "role": "user",
            "content": prompt,
        })

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature if temperature is not None else settings.LLM_TEMPERATURE,
            "max_tokens": max_tokens if max_tokens is not None else settings.LLM_MAX_TOKENS,
            "stream": True,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        url = f"{self.base_url}/chat/completions"

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                url,
                headers=headers,
                json=payload,
            ) as response:
                if response.status_code >= 400:
                    error_text = await response.aread()
                    logger.error(f"OpenAI-compatible stream API error {response.status_code}: {error_text.decode(errors='ignore')}")
                    response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line:
                        continue

                    if not line.startswith("data: "):
                        continue

                    data_text = line.replace("data: ", "", 1).strip()

                    if data_text == "[DONE]":
                        break

                    try:
                        data = json.loads(data_text)
                        delta = data["choices"][0].get("delta", {})
                        content = delta.get("content")

                        if content:
                            yield content

                    except Exception as e:
                        logger.warning(f"Failed to parse stream chunk: {e}")
                        continue


_openai_llm_service: Optional[OpenAICompatibleService] = None


def get_openai_llm_service() -> OpenAICompatibleService:
    """Get or create OpenAI-compatible LLM service instance."""
    global _openai_llm_service

    if _openai_llm_service is None:
        _openai_llm_service = OpenAICompatibleService()

    return _openai_llm_service
