"""Esquema CERRADO del reporte de la suite `evaluate` (ADR-41, «Reporte»): agregados y configuración, nunca textos."""

from __future__ import annotations

from app.evaluation.cronometro import ETAPAS
from app.evaluation.reporte import Enumerado, Identificador, Numero, Objeto

SUITES = ("retrieval", "generation", "all")
VERSION_ESQUEMA = "oncolens.evaluate.v1"

_IC = Objeto({"inferior": Numero(), "superior": Numero()})
_RECUPERACION = Objeto(
    {
        "recall_at_10": Numero(),
        "mrr": Numero(),
        "n": Numero(),
        "recall_ic95": _IC,
        "mrr_ic95": _IC,
    }
)
_FAMILIAS = Objeto(
    {
        "recuperacion": Objeto({"total": _RECUPERACION, "es_a_en": _RECUPERACION}),
        "citas": Objeto({"precision": Numero(), "n": Numero()}),
        "sin_evidencia": Objeto(
            {"exactitud": Numero(), "n": Numero(), "violaciones_rn02": Numero()}
        ),
        "opciones_con_cita_y_soporte": Objeto({"porcentaje": Numero(), "n": Numero()}),
    },
    opcionales=frozenset({"recuperacion", "citas", "sin_evidencia", "opciones_con_cita_y_soporte"}),
)
_MODELOS = Objeto(
    {
        "embeddings": Identificador(),
        "reranker": Identificador(),
        "nli": Identificador(),
        "llm": Identificador(),
    }
)
_UMBRALES = Objeto(
    {
        "relevanceThreshold": Numero(),
        "nliEntailmentThreshold": Numero(),
        "retrievalTopK": Numero(),
        "rerankTopN": Numero(),
    }
)
_CONFIGURACION = Objeto(
    {
        "nombre": Identificador(),
        "hashConfig": Identificador(),
        "fixture": Identificador(),
        "claseDataset": Enumerado(frozenset({"sintetico", "real_anonimizado"})),
        "dataset": Objeto({"nombre": Identificador(), "version": Identificador()}),
        "proveedor": Enumerado(frozenset({"fake", "local"})),
        "reloj": Enumerado(frozenset({"simulado", "real"})),
        "semillaBootstrap": Numero(),
        "bootstrapRepeticiones": Numero(),
        "modelos": _MODELOS,
        "promptVersion": Identificador(),
        "umbrales": _UMBRALES,
        "corpusRelease": Identificador(),
        "catalogVersion": Identificador(),
    }
)

ESQUEMA_SUITE = Objeto(
    {
        "esquema": Enumerado(frozenset({VERSION_ESQUEMA})),
        "suite": Enumerado(frozenset(SUITES)),
        "configuracion": _CONFIGURACION,
        "metricas": Objeto({"completa": _FAMILIAS}),
        "latencia_p95_ms": Objeto({etapa: Numero() for etapa in ETAPAS}),
    }
)
