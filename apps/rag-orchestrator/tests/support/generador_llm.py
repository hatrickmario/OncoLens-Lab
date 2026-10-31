"""El ``LlmEvidenceGenerator`` real con los valores iniciales de las afirmaciones atómicas (RN-22), para los tests.

El generador no tiene valores por defecto: en producción los entrega la configuración; en los tests, esta fábrica.
"""

from __future__ import annotations

from typing import Any

from app.application.generation import LlmEvidenceGenerator
from app.application.ports import LlmClient
from app.domain.atribucion import CLAIM_MAX_WORDS_INICIAL, CLAIMS_MAX_INICIAL, CLAIMS_MIN_INICIAL


def generador_con_llm(cliente: LlmClient, **cambios: Any) -> LlmEvidenceGenerator:
    valores: dict[str, Any] = {
        "claims_min": CLAIMS_MIN_INICIAL,
        "claims_max": CLAIMS_MAX_INICIAL,
        "claim_max_words": CLAIM_MAX_WORDS_INICIAL,
        **cambios,
    }
    return LlmEvidenceGenerator(cliente, **valores)
