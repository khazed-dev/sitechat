"""
LLM factory.
Selects the correct LLM provider based on LLM_PROVIDER in .env.
"""

from loguru import logger

from app.config import settings
from app.services.ollama import get_ollama_service
from app.services.openai_llm import get_openai_llm_service


def get_llm_service():
    """
    Return LLM service based on settings.LLM_PROVIDER.

    Supported:
    - ollama
    - openai

    For Groq, use:
    LLM_PROVIDER=openai
    OPENAI_BASE_URL=https://api.groq.com/openai/v1
    """
    provider = getattr(settings, "LLM_PROVIDER", "ollama").lower().strip()

    if provider == "openai":
        logger.info("Using OpenAI-compatible LLM service.")
        return get_openai_llm_service()

    if provider == "ollama":
        logger.info("Using Ollama LLM service.")
        return get_ollama_service()

    logger.warning(f"Unknown LLM_PROVIDER='{provider}', falling back to Ollama.")
    return get_ollama_service()
