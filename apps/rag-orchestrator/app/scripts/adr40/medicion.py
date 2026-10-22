"""Medicion de un candidato de ADR-40 sobre ``pii-mini``: sensibilidad, falsos positivos clinicos y latencia p95.

El reloj se inyecta (``reloj``) para que las pruebas sean deterministas. El reporte lleva solo agregados y tipos:
nunca textos ni valores de PII (RN-14).
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import asdict
from typing import Any

from app.evaluation.medicion_modelos import mediana, percentil_95
from app.scripts.adr40.dataset import CONTEXTO_DE_DOCUMENTO, TextoSembrado
from app.scripts.adr40.detectores import DetectorPii
from app.scripts.adr40.reglas import (
    Sensibilidad,
    Span,
    falsos_positivos_clinicos,
    sensibilidad_por_tipo,
)

Reloj = Callable[[], float]


def _latencias_ms(
    detector: DetectorPii, textos: Sequence[TextoSembrado], reloj: Reloj
) -> list[float]:
    latencias = []
    for t in textos:
        inicio = reloj()
        detector.detectar(t.texto)
        latencias.append((reloj() - inicio) * 1000)
    return latencias


def _sensibilidad_a_dict(medidas: dict[str, Sensibilidad]) -> dict[str, Any]:
    return {tipo: asdict(m) for tipo, m in medidas.items()}


def medir_candidato(
    detector: DetectorPii,
    textos: Sequence[TextoSembrado],
    *,
    corridas: int,
    minimo_cobertura: float,
    remuestreos: int,
    semilla: int,
    reloj: Reloj,
) -> dict[str, Any]:
    """Agregados del candidato: la sensibilidad es determinista; la latencia es la mediana de los p95 de cada corrida."""
    p95_por_corrida = [
        percentil_95(_latencias_ms(detector, textos, reloj)) for _ in range(corridas)
    ]
    hallazgos: dict[str, list[Span]] = {t.id: detector.detectar(t.texto) for t in textos}
    documentos = [t for t in textos if t.contexto == CONTEXTO_DE_DOCUMENTO]

    def sensibilidad(subconjunto: Sequence[TextoSembrado]) -> dict[str, Any]:
        resultados = [(t.etiquetas, hallazgos[t.id]) for t in subconjunto]
        return _sensibilidad_a_dict(
            sensibilidad_por_tipo(resultados, minimo_cobertura, remuestreos, semilla)
        )

    return {
        "sensibilidad_documentos": sensibilidad(documentos),
        "sensibilidad_todos_los_contextos": sensibilidad(textos),
        "falsos_positivos_clinicos": asdict(
            falsos_positivos_clinicos([(t.controles, hallazgos[t.id]) for t in textos])
        ),
        "latencia_p95_ms": mediana(p95_por_corrida),
        "latencia_p95_ms_por_corrida": p95_por_corrida,
        "corridas": corridas,
    }
