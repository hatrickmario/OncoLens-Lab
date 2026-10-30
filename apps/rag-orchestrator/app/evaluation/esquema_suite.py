"""Esquema CERRADO del reporte de la suite `evaluate` (ADR-41, «Reporte»): agregados y configuración, nunca textos."""

from __future__ import annotations

from app.evaluation.acuerdo_juez import ESTADO_CONCLUYENTE, ESTADO_NO_CONCLUYENTE, SIN_MEDIR
from app.evaluation.config_suite import PROVEEDORES, RELOJES, SUITES
from app.evaluation.cronometro import ETAPAS
from app.evaluation.fuente_dataset import CLASES_ADMITIDAS
from app.evaluation.metricas.fidelidad import ROTULO_SECUNDARIA
from app.evaluation.informe_pii import MODOS, TIPOS_DIRECTOS
from app.evaluation.reporte import Booleano, Enumerado, Huella, Identificador, Lista, Numero, Objeto
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


def _familia(campos: dict[str, object], opcionales: frozenset[str] = frozenset()) -> Objeto:
    """Toda familia de métricas declara cuántas preguntas validadas y no validadas la componen (AC-4)."""
    return Objeto({**campos, "validacion": _VALIDACION}, opcionales=opcionales)


_FRACCION_DE_AFIRMACIONES = {
    "afirmaciones": Numero(),
    "soportadas": Numero(),
    "fidelidad": Numero(),
}
_FIDELIDAD = _familia(
    {
        "nli": Objeto(_FRACCION_DE_AFIRMACIONES),
        "juez_llm": Objeto(
            {
                "rotulo": Enumerado(frozenset({ROTULO_SECUNDARIA})),
                **_FRACCION_DE_AFIRMACIONES,
                "discrepancias_con_nli": Numero(),
                "veredictos_invalidos": Numero(),
                "acuerdo_con_nli": Objeto(
                    {
                        "muestra": Numero(),
                        "porcentaje": Numero(),
                        "kappa": Numero(),
                        "discrepancias": Lista(Identificador()),
                    }
                ),
                "acuerdo_con_humano": Enumerado(frozenset({SIN_MEDIR})),
                "estado": Enumerado(frozenset({ESTADO_CONCLUYENTE, ESTADO_NO_CONCLUYENTE})),
            }
        ),
    },
    opcionales=frozenset({"juez_llm"}),
)


_CAMPOS_DE_FAMILIA = {
    "recuperacion": _familia({"total": _RECUPERACION, "es_a_en": _RECUPERACION}),
    "citas": _familia({"precision": Numero(), "n": Numero()}),
    "sin_evidencia": _familia({"exactitud": Numero(), "n": Numero(), "violaciones_rn02": Numero()}),
    "opciones_con_cita_y_soporte": _familia({"porcentaje": Numero(), "n": Numero()}),
    "fidelidad": _FIDELIDAD,
    "terminos_prohibidos": _familia(
        {
            "propuesta_cruda": Numero(),
            "salida_mostrada": Numero(),
            "propuesta_cruda_por_nivel": Objeto({"A": Numero(), "B": Numero()}),
            "terminos_compartidos_con_corpus_citado": Numero(),
            "terminos_nivel_a": Lista(Identificador()),
            "terminos_nivel_b": Lista(Identificador()),
            "atribucion": Objeto({"opciones": Numero(), "con_formula": Numero()}),
        }
    ),
    "inyeccion": _familia({"casos": Numero(), "efectivas": Numero()}),
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
_JUEZ = Objeto(
    {
        "proveedor": Enumerado(frozenset(PROVEEDORES)),
        "modelo": Identificador(),
        "temperatura": Numero(),
        "semilla": Numero(),
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
        "juez": _JUEZ,
        "reloj": Enumerado(frozenset(RELOJES)),
        "semillaBootstrap": Numero(),
        "bootstrapRepeticiones": Numero(),
        "modelos": _MODELOS,
        "promptVersion": Identificador(),
        "umbrales": _UMBRALES,
        "corpusRelease": Identificador(),
        "catalogVersion": Identificador(),
    },
    opcionales=frozenset({"juez", "modelos", "promptVersion"}),
)

_SENSIBILIDAD = Objeto({"aciertos": Numero(), "total": Numero(), "valor": Numero()})
_MODO_PII = Objeto(
    {
        "por_tipo": Objeto(
            {tipo: _SENSIBILIDAD for tipo in TIPOS_DIRECTOS}, opcionales=frozenset(TIPOS_DIRECTOS)
        ),
        "total": _SENSIBILIDAD,
        "tipos_por_debajo": Numero(),
        "cumple_minimo": Booleano(),
    }
)
_PRIVACIDAD = Objeto(
    {
        "textos_sembrados": Numero(),
        "llamadas_salientes_registradas": Numero(),
        "llamadas_nube_datos_reales": Numero(),
        "sensibilidad_b1_medida": Booleano(),
        "sensibilidad_b1": Objeto(
            {"textos_medidos": Numero(), **{modo: _MODO_PII for modo in MODOS}}
        ),
        "adaptadores_cubiertos": Lista(Identificador()),
    },
    opcionales=frozenset({"sensibilidad_b1", "adaptadores_cubiertos"}),
)
_LATENCIA_NLI = Objeto({"n": Numero(), "p50_ms": Numero(), "p95_ms": Numero()})
_RECURSOS_NLI = Objeto(
    {
        "rss_maximo_mib": Numero(),
        "rss_limite_mib": Numero(),
        "supera_el_limite": Booleano(),
        "latencia_ms": Objeto({"por_lote": _LATENCIA_NLI, "por_hipotesis": _LATENCIA_NLI}),
    }
)

ESQUEMA_SUITE = Objeto(
    {
        "esquema": Enumerado(frozenset({VERSION_ESQUEMA})),
        "suite": Enumerado(frozenset(SUITES)),
        "configuracion": _CONFIGURACION,
        "metricas": Objeto({"completa": _FAMILIAS, "revisada": _FAMILIAS}),
        "privacidad": _PRIVACIDAD,
        "recursos_nli": _RECURSOS_NLI,
        "latencia_p95_ms": Objeto({etapa: Numero() for etapa in ETAPAS}),
    },
    opcionales=frozenset({"privacidad", "recursos_nli"}),
)


# --- Familia `aplicabilidad` (US-132): reporte propio, solo agregados e identificadores -------------------------------

_ESTADOS_DEL_PAR = {
    estado: Numero() for estado in ("coincide", "parcial", "no_coincide", "desconocido")
}
_MARCAS = frozenset({"en_meta", "fuera_de_meta", "no_medida"})
_CAUSAS_SIN_EXACTITUD = frozenset({"sin_archivo", "sin_campos", "todo_pendiente"})

ESQUEMA_APLICABILIDAD = Objeto(
    {
        "esquema": Enumerado(frozenset({VERSION_ESQUEMA})),
        "suite": Enumerado(frozenset({"aplicabilidad"})),
        "configuracion": Objeto(
            {
                "nombre": Identificador(),
                "hashConfig": Huella(),
                "fixture": Identificador(),
                "claseDataset": Enumerado(frozenset(CLASES_ADMITIDAS)),
                "dataset": Objeto({"nombre": Identificador(), "version": Identificador()}),
                "proveedor": Enumerado(frozenset(PROVEEDORES)),
                "reloj": Enumerado(frozenset(RELOJES)),
                "catalogVersion": Identificador(),
                "umbrales": Objeto({"nliEntailmentThreshold": Numero()}),
            }
        ),
        "metricas": Objeto(
            {
                "aplicabilidad": Objeto(
                    {
                        "pares": Lista(
                            Objeto(
                                {"id": Identificador(), **_ESTADOS_DEL_PAR, "acierto": Booleano()}
                            )
                        ),
                        "concordancia_de_estados": Objeto(
                            {"aciertos": Numero(), "total": Numero(), "valor": Numero()}
                        ),
                        "criterios_coincide_sin_cita": Numero(),
                        "valores_paciente_no_copiados": Numero(),
                        "omitidas": Numero(),
                    }
                ),
                "cobertura_poblacion": Objeto(
                    {
                        "version": Identificador(),
                        "vigentes": Numero(),
                        "con_criterios": Numero(),
                        "valor": Numero(),
                        "meta": Numero(),
                        "marca": Enumerado(_MARCAS),
                    }
                ),
                "exactitud_extraido_verificado": Objeto(
                    {
                        "documentos": Numero(),
                        "revisados": Numero(),
                        "correctos": Numero(),
                        "pendientes": Numero(),
                        "valor": Numero(),
                        "meta": Numero(),
                        "marca": Enumerado(_MARCAS),
                        "causa": Enumerado(_CAUSAS_SIN_EXACTITUD),
                    },
                    opcionales=frozenset({"causa"}),
                ),
            }
        ),
    }
)
