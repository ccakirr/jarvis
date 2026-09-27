from smolagents import LiteLLMModel

from ..core.config import (
    LLM_API_BASE,
    LLM_API_KEY,
    LLM_MODEL_ID,
    LLM_TEMPERATURE
)


def create_llm_model():
    if not LLM_MODEL_ID:
        raise ValueError(
            "LLM_MODEL_ID is not configured."
        )

    return LiteLLMModel(
        model_id=LLM_MODEL_ID,
        api_base=LLM_API_BASE,
        api_key=LLM_API_KEY,
        temperature=LLM_TEMPERATURE,
    )
