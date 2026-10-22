"""Esquema CERRADO del reporte de la suite `evaluate` (ADR-41, «Reporte»): agregados y configuración, nunca textos."""

from __future__ import annotations

from app.evaluation.config_suite import PROVEEDORES, RELOJES, SUITES
from app.evaluation.cronometro import ETAPAS
from app.evaluation.fuente_dataset import CLASES_ADMITIDAS
from app.evaluation.reporte import Enumerado, Huella, Identificador, Numero, Objeto
from app.evaluation.rotulo import ROTULOS

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
_VALIDACION = Objeto(
    {
        "preguntas_validadas": Numero(),
        "preguntas_no_validadas": Numero(),
        "rotulo": Enumerado(frozenset(ROTULOS)),
    }
)


def _familia(campos: dict[str, object]) -> Objeto:
    """Toda familia de métricas declara cuántas preguntas validadas y no validadas la componen (AC-4)."""
    return Objeto({**campos, "validacion": _VALIDACION})


_CAMPOS_DE_FAMILIA = {
    "recuperacion": _familia({"total": _RECUPERACION, "es_a_en": _RECUPERACION}),
    "citas": _familia({"precision": Numero(), "n": Numero()}),
    "sin_evidencia": _familia({"exactitud": Numero(), "n": Numero(), "violaciones_rn02": Numero()}),
    "opciones_con_cita_y_soporte": _familia({"porcentaje": Numero(), "n": Numero()}),
}
# Cada suite calcula solo algunas familias: todas son opcionales en el esquema.
_FAMILIAS = Objeto(_CAMPOS_DE_FAMILIA, opcionales=frozenset(_CAMPOS_DE_FAMILIA))
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
        "hashConfig": Huella(),
        "fixture": Identificador(),
        "claseDataset": Enumerado(frozenset(CLASES_ADMITIDAS)),
        "dataset": Objeto({"nombre": Identificador(), "version": Identificador()}),
        "proveedor": Enumerado(frozenset(PROVEEDORES)),
        "reloj": Enumerado(frozenset(RELOJES)),
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
        "metricas": Objeto({"completa": _FAMILIAS, "revisada": _FAMILIAS}),
        "latencia_p95_ms": Objeto({etapa: Numero() for etapa in ETAPAS}),
    }
)
