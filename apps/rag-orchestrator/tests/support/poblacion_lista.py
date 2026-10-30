"""FX-08b-c: población del estudio en lista por fragmento (ADR-47, US-241): la forma nueva de ``population_criteria``.

``doc-a1`` se conserva en la forma antigua (``CRITERIOS_DE_DOC_A1``) para probar el lector doble. Solo datos sintéticos."""

from __future__ import annotations

from typing import Any

PROCEDENCIA_DE_PRUEBA = {
    "promptVersion": "poblacion@0.1.0",
    "modelVersion": "llm-local-ejemplo",
    "catalogVersion": "test-apl-1.2.0",
    "nliResult": "entailment",
}


def valor_nuevo(valor: str, chunk_id: str, alcance: str = "elegibilidad") -> dict[str, Any]:
    """Un valor de la forma nueva: ``{value, chunkId, scope}`` con su procedencia (D4)."""
    return {"value": valor, "chunkId": chunk_id, "scope": alcance, **PROCEDENCIA_DE_PRUEBA}


MARCA_PENDIENTE: dict[str, Any] = {"status": "pendiente", "values": []}
"""D5: un criterio cuya extracción falló tras el reintento."""

# doc-b1 (ECA): ``ch-b1-1`` (Elegibilidad) → estado_menopausico = [premenopausal women, postmenopausal women].
CRITERIOS_DE_DOC_B1: dict[str, object] = {
    "estado_menopausico": [
        valor_nuevo("premenopausal women", "ch-b1-1"),
        valor_nuevo("postmenopausal women", "ch-b1-1"),
    ],
}

SENTINELA_DE_VALOR = "SENTINELA-VALOR-DE-POBLACION"
"""Texto que ningún log puede contener (RN-14): va como valor de los criterios inválidos."""
