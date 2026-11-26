"""Esquema CERRADO del reporte de la suite `evaluate` (ADR-41, «Reporte»): agregados y configuración, nunca textos."""

from __future__ import annotations

from app.domain.expansion_contextual import CAMPOS_DE_EXPANSION, FORMATOS_DE_CONSULTA
from app.domain.ventanas_del_reranker import MODOS_DE_VENTANAS
from app.evaluation.adopcion_del_brazo import MOTIVOS_DE_NO_ADOPCION
from app.evaluation.acuerdo_juez import ESTADO_CONCLUYENTE, ESTADO_NO_CONCLUYENTE, SIN_MEDIR
from app.evaluation.config_suite import PROVEEDORES, RELOJES, SUITES
from app.evaluation.cronometro import ETAPAS
from app.evaluation.dataset_diagnostico import IDIOMAS, TIPOS_DE_VARIACION
from app.evaluation.dataset_poblacion import CLASES_DEL_DORADO
from app.evaluation.fuente_dataset import CLASES_ADMITIDAS
from app.evaluation.informe_pii import MODOS, TIPOS_DIRECTOS
from app.evaluation.metricas.diagnostico import (
    CAUSAS_SIN_ASIGNAR,
    CONDICIONES_DE_LA_REGLA,
    ETAPAS as ETAPAS_DE_LA_CONSULTA,
    NOTA_DE_CALIBRACION,
    RESULTADO_PERDIDA,
    RESULTADO_SIN_ASIGNAR,
    RESULTADO_SIN_PERDIDA,
)
from app.evaluation.metricas.contextual import (
    CAUSAS_DE_SINONIMO,
    CLASES_DE_PREGUNTA,
    CONDICIONES_DE_LA_CAUSA,
    ESTADOS_DE_FILA,
    METRICAS_FRENTE_A_LA_BASE,
    SEGUNDO_LOOP_CONTEXTUAL,
    SEGUNDO_LOOP_NINGUNO,
)
from app.evaluation.metricas.fidelidad import ROTULO_SECUNDARIA
from app.evaluation.reporte import (
    Anulable,
    Booleano,
    Enumerado,
    Huella,
    Identificador,
    Lista,
    Numero,
    Objeto,
)
from app.evaluation.revision_provisional import (
    ROLES_DE_REVISION_PROVISIONAL,
    ROTULO_DE_REVISION_PROVISIONAL,
)
from app.evaluation.rotulo import ROTULOS
from app.evaluation.viabilidad_del_brazo import ESTADOS_DE_VIABILIDAD, MOTIVOS_DE_NO_VIABILIDAD
from app.schemas.generated.models import Fusion, RetrievalMode

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
                # Con estado no_concluyente `fidelidad` es null y la cifra queda aquí, solo informativa.
                "valor_informativo": Numero(),
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
            # `propuesta_cruda`, `salida_mostrada` y `terminos_compartidos_con_corpus_citado` cuentan CAMPOS generados con
            # algún término de la lista (un campo cuenta una vez), no salidas completas: son
            # `campos_con_termino_de_la_lista_*`. Sus nombres se conservan por la huella del baseline.
            "propuesta_cruda": Numero(),
            "salida_mostrada": Numero(),
            "salida_mostrada_nivel_a": Numero(),  # bloqueante (meta 0)
            "salida_mostrada_nivel_b": Numero(),  # bloqueante (meta 0, US-249 AC-4)
            "salida_mostrada_por_nivel": Objeto({"A": Numero(), "B": Numero()}),
            "corregidas_por_el_filtro": Objeto({"A": Numero(), "B": Numero()}),
            "campos_mostrados": Lista(Objeto({"campo": Identificador(), "regla": Identificador()})),
            "propuesta_cruda_por_nivel": Objeto({"A": Numero(), "B": Numero()}),
            "terminos_compartidos_con_corpus_citado": Numero(),
            "terminos_nivel_a": Lista(Identificador()),
            "terminos_nivel_b": Lista(Identificador()),
            "atribucion": Objeto({"opciones": Numero(), "con_formula": Numero()}),
        }
    ),
    "inyeccion": _familia({"casos": Numero(), "efectivas": Numero()}),
    "no_inferencia": _familia(
        {
            "estado": Enumerado(frozenset({"medida", "no_medida"})),
            "casos": Numero(),
            "casos_sin_inferencia": Numero(),
            "casos_con_inferencia": Lista(Identificador()),
            "inferencias": Numero(),
            "veredictos_invalidos": Numero(),
        }
    ),
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
# D5-55: la familia `opciones` también declara los modelos de recuperación que respondieron; son opcionales para que los
# reportes históricos (solo `llm`) sigan validando.
_MODELOS_DE_OPCIONES = Objeto(
    {
        "llm": Identificador(),
        "embeddings": Identificador(),
        "reranker": Identificador(),
        "nli": Identificador(),
    },
    opcionales=frozenset({"embeddings", "reranker", "nli"}),
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
        # ru_maxrss del proceso ENTERO (carga de los tres modelos); no es el RSS del NLI ni el del régimen.
        "rss_pico_proceso_mib": Numero(),
        "rss_limite_mib": Numero(),
        "supera_el_limite": Booleano(),
        "latencia_ms": Objeto(
            {
                "por_lote": _LATENCIA_NLI,
                # La duración del lote repartida entre sus hipótesis: una media, no la latencia de una hipótesis sola.
                "media_por_hipotesis_del_lote_ms": _LATENCIA_NLI,
            }
        ),
    }
)

_METRICAS_DE_DIFERENCIA = Objeto(
    {
        "recall_at_10_total": Numero(),
        "recall_at_10_es_a_en": Numero(),
        "mrr": Numero(),
        # US-278: solo en las comparaciones con brazos del reranker; ``None`` = una de las dos medidas falta.
        "falsos_sin_evidencia": Numero(),
        "parafrasis_recuperadas": Numero(),
        "p95_reranker_ms": Numero(),
        "p95_consulta_ms": Numero(),
    },
    opcionales=frozenset(
        {"falsos_sin_evidencia", "parafrasis_recuperadas", "p95_reranker_ms", "p95_consulta_ms"}
    ),
)
_ETAPA_DEL_RERANKER = Objeto(
    {
        "modo": Enumerado(frozenset(MODOS_DE_VENTANAS)),
        "solape": Numero(),
        "max_length": Numero(),
        "max_pairs": Numero(),
    }
)
_VIABILIDAD = Objeto(
    {
        "estado": Enumerado(ESTADOS_DE_VIABILIDAD),
        "motivos": Lista(Enumerado(MOTIVOS_DE_NO_VIABILIDAD)),
        "p95_consulta_s": Numero(),
        "tope_p95_s": Numero(),
        "memoria_gb": Numero(),
        "limite_memoria_gb": Numero(),
    }
)
_REESCRITURA_DEL_BRAZO = Objeto({"habilitada": Booleano(), "invocaciones": Numero()})
_PARAFRASIS_ATRIBUIDAS = Objeto(
    {
        # US-277 AC-2: pares que la referencia pierde en la recuperación o en el umbral y los que el brazo recupera.
        "aplicables": Numero(),
        "recuperadas": Numero(),
        "proporcion": Numero(),  # None = sin pares aplicables, nunca 0.0
        "sin_pares_aplicables": Booleano(),
    }
)
_ADOPCION = Objeto(
    {
        "adoptable": Anulable(
            Booleano()
        ),  # None = lo medido no alcanza para afirmarlo (p. ej. sin memoria del stack)
        "motivos": Lista(Enumerado(MOTIVOS_DE_NO_ADOPCION)),
    }
)
_BRAZO = Objeto(
    {
        "nombre": Identificador(),
        "retrievalMode": Enumerado(frozenset(m.value for m in RetrievalMode)),
        "fusion": Enumerado(frozenset(f.value for f in Fusion)),
        "fusionParam": Numero(),
        "huellaConfig": Huella(),
        "recuperacion": Objeto({"total": _RECUPERACION, "es_a_en": _RECUPERACION}),
        "diferencia_frente_a_a0": _METRICAS_DE_DIFERENCIA,
        "retroceso": Booleano(),
        "trazabilidad": Objeto({"consultas": Numero(), "coherentes": Numero()}),
        "sin_terminos_lexicos": Objeto({"n": Numero(), "proporcion": Numero()}),
        "por_documento": Lista(
            Objeto({"documento": Identificador(), "recall_at_10": Numero(), "n": Numero()})
        ),
        # US-278: las cinco claves siguientes solo existen si la comparación declara brazos del reranker.
        "reranker": Anulable(_ETAPA_DEL_RERANKER),
        "falsos_sin_evidencia": Objeto({"n": Numero(), "total": Numero()}),
        "parafrasis": Objeto({"pares": Numero(), "recuperadas": Numero()}),
        "latencia_ms": Objeto({"reranker_p95": Numero(), "consulta_p95": Numero()}),
        "viabilidad": _VIABILIDAD,
        # US-277: solo si la comparación declara brazos de pares o de reescritura (``adopcion``, además, solo fuera de A0).
        "reescritura": _REESCRITURA_DEL_BRAZO,
        "parafrasis_atribuidas": _PARAFRASIS_ATRIBUIDAS,
        "adopcion": _ADOPCION,
    },
    opcionales=frozenset(
        {
            "diferencia_frente_a_a0",
            "reranker",
            "falsos_sin_evidencia",
            "parafrasis",
            "latencia_ms",
            "viabilidad",
            "reescritura",
            "parafrasis_atribuidas",
            "adopcion",
        }
    ),
)
_CORPUS_DE_LA_COMPARACION = Objeto(
    {
        # US-278 AC-4, [S7 resp. 10]: el corpus con el que corrieron los brazos (la ingesta de l1d-119 u otro índice), sin texto.
        "fuente": Enumerado(frozenset({"dataset", "indice"})),
        "declarado": Anulable(Identificador()),
        "coleccion": Anulable(Identificador()),
        "chunks_vigentes": Numero(),
        "huella": Anulable(Huella()),
        "chunk_size_configurado": Numero(),
        "indices_distintos": Lista(Identificador()),
    }
)
_COMPARACION_RECUPERACION = Objeto(
    {
        "referencia": Identificador(),
        "tolerancia_retroceso": Numero(),
        "retroceso": Booleano(),
        "brazos": Lista(_BRAZO),
        "corpus": _CORPUS_DE_LA_COMPARACION,
    },
    opcionales=frozenset({"corpus"}),
)

_RECHAZOS_LEGITIMOS = Objeto(
    {
        # US-249 AC-5: salidas legítimas que rechaza el filtro con la lista 1.5.0 (línea base de US-068) y con la vigente.
        "salidas_legitimas": Numero(),
        "con_la_lista_1_5_0": Numero(),
        "con_la_lista_vigente": Numero(),
        "diferencia": Numero(),
        "tolerancia": Numero(),
    }
)

_SALIDAS_INVALIDAS = Objeto(
    {
        # D5-06, D5-28: preguntas cuya generación falló la validación del esquema interno; solo ids de pregunta y de regla.
        "casos": Numero(),
        "preguntas": Lista(Objeto({"caso": Identificador(), "reglas": Lista(Identificador())})),
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
        "comparacion_recuperacion": _COMPARACION_RECUPERACION,
        "rechazos_legitimos": _RECHAZOS_LEGITIMOS,
        "salidas_invalidas": _SALIDAS_INVALIDAS,
        "latencia_p95_ms": Objeto({etapa: Numero() for etapa in ETAPAS}),
    },
    opcionales=frozenset(
        {
            "privacidad",
            "recursos_nli",
            "comparacion_recuperacion",
            "rechazos_legitimos",
            "salidas_invalidas",
        }
    ),
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


# --- Familia `poblacion` (L1D-299): reporte propio, solo agregados e identificadores del corpus público --------------

_MARCAS_DE_POBLACION = frozenset(_MARCAS | {"no_concluyente"})
_ESTADOS_DE_LA_MEDICION = frozenset({"concluyente", "no_concluyente"})
_POR_ESTADO = Objeto({"esperados": Numero(), "aciertos": Numero()})
_DOCUMENTO_Y_CRITERIO = Objeto({"documento": Identificador(), "criterio": Identificador()})


def _desagregado_de_poblacion(grupo: str) -> Lista:
    """Precisión y cobertura de un grupo del dorado (redacción o tipo): solo conteos y fracciones, informativas."""
    return Lista(
        Objeto(
            {
                grupo: Identificador(),
                "esperados": Numero(),
                "obtenidos": Numero(),
                "coincidentes": Numero(),
                "precision": Numero(),
                "cobertura": Numero(),
            }
        )
    )


ESQUEMA_POBLACION = Objeto(
    {
        "esquema": Enumerado(frozenset({VERSION_ESQUEMA})),
        "suite": Enumerado(frozenset({"poblacion"})),
        "configuracion": Objeto(
            {
                "nombre": Identificador(),
                "hashConfig": Huella(),
                "fixture": Identificador(),
                "claseDataset": Enumerado(frozenset(CLASES_DEL_DORADO)),
                "dataset": Objeto({"nombre": Identificador(), "version": Identificador()}),
                "proveedor": Enumerado(frozenset(PROVEEDORES)),
                "reloj": Enumerado(frozenset(RELOJES)),
                "umbrales": Objeto({"nliEntailmentThreshold": Numero()}),
                "revision": Objeto(
                    {"completa": Booleano(), "rol": Identificador(), "fecha": Identificador()},
                    opcionales=frozenset({"rol", "fecha"}),
                ),
                "revision_provisional": Objeto(
                    {
                        "rol": Enumerado(frozenset(ROLES_DE_REVISION_PROVISIONAL)),
                        "fecha": Identificador(),
                        "rotulo": Enumerado(frozenset({ROTULO_DE_REVISION_PROVISIONAL})),
                    }
                ),
            },
            opcionales=frozenset({"revision_provisional"}),
        ),
        "metricas": Objeto(
            {
                "pares_del_dorado": Numero(),
                "estratos": Lista(Objeto({"estrato": Identificador(), "pares": Numero()})),
                "por_criterio": Lista(
                    Objeto(
                        {
                            "criterio": Identificador(),
                            "esperados": Numero(),
                            "obtenidos": Numero(),
                            "coincidentes": Numero(),
                            "precision": Numero(),
                            "cobertura": Numero(),
                            "meta_precision": Numero(),
                            "meta_cobertura": Numero(),
                            "marca_precision": Enumerado(_MARCAS_DE_POBLACION),
                            "marca_cobertura": Enumerado(_MARCAS_DE_POBLACION),
                        }
                    )
                ),
                "por_redaccion": _desagregado_de_poblacion("redaccion"),
                "por_tipo_de_redaccion": _desagregado_de_poblacion("tipo_de_redaccion"),
                "distractores": Objeto(
                    {
                        "pares": Numero(),
                        "valores_indebidos": Numero(),
                        "pares_con_indebidos": Numero(),
                    }
                ),
                "rendija_c3": Objeto(
                    {"casos": Numero(), "desconocido": Numero(), "otros": Numero()}
                ),
                "tasa_duplicados": Objeto(
                    {
                        "obtenidos": Numero(),
                        "duplicados": Numero(),
                        "valor": Numero(),
                        "meta": Numero(),
                        "marca": Enumerado(_MARCAS),
                    }
                ),
                "cortes_por_longitud": Objeto(
                    {"tareas": Numero(), "cortes": Numero(), "casos": Lista(_DOCUMENTO_Y_CRITERIO)}
                ),
                "concordancia": Objeto(
                    {
                        "por_estado": Objeto(
                            {
                                estado: _POR_ESTADO
                                for estado in ("coincide", "parcial", "no_coincide", "desconocido")
                            }
                        ),
                        "aciertos": Numero(),
                        "total": Numero(),
                        "valor": Numero(),
                        "meta": Numero(),
                        "marca": Enumerado(_MARCAS),
                        "no_coincide_indebido": Numero(),
                        "coincide_indebido": Numero(),
                    }
                ),
                "sin_evidencia": Objeto(
                    {
                        "baseline": Numero(),
                        "actual": Numero(),
                        "baja": Booleano(),
                        "violaciones_rn02": Numero(),
                    }
                ),
                "bucle": Objeto(
                    {
                        "pares": Numero(),
                        "cortes": Numero(),
                        "tasa": Numero(),
                        "minimo_de_pares": Numero(),
                        "out06": Enumerado(frozenset({"cerrada", "abierta", "insuficiente"})),
                    }
                ),
            }
        ),
        "veredicto": Objeto(
            {
                "resultado": Enumerado(frozenset({"pass", "fail", "no_concluyente"})),
                "precision": Enumerado(_ESTADOS_DE_LA_MEDICION),
                "cobertura": Enumerado(_ESTADOS_DE_LA_MEDICION),
                "causas": Lista(Enumerado(frozenset({"sin_revisor", "muestra_insuficiente"}))),
                "invariantes_violadas": Lista(Identificador()),
            }
        ),
    }
)


# --- Familia `opciones` (US-140): reporte propio, solo agregados e identificadores de caso, de opción y de regla --------

_FAMILIA_DE_OPCIONES = {
    "m_10_1": {"mostradas": Numero(), "con_cita_y_soporte": Numero(), "porcentaje": Numero()},
    "m_10_2": {"nivel_a": Numero(), "nivel_b": Numero(), "campos_con_termino": Numero()},
    "citas": {"precision": Numero(), "n": Numero()},
    "fidelidad": _FRACCION_DE_AFIRMACIONES,
    "opciones_por_analisis": {"analisis": Numero(), "media": Numero()},
    "orden_rn28": {"analisis": Numero(), "conformes": Numero(), "porcentaje": Numero()},
    "no_comparable": {"casos": Numero(), "mostrada_al_final": Numero(), "no_mostrada": Numero()},
    "esperadas_presentes": {"esperadas": Numero(), "presentes": Numero(), "porcentaje": Numero()},
}
_VALIDACION_DE_OPCIONES = Objeto(
    {
        "preguntas_validadas": Numero(),
        "preguntas_no_validadas": Numero(),
        # S7-D1: tres recuentos (validadas por un oncólogo, de mecánica verificada por IA y sin revisar).
        "preguntas_mecanica_verificada": Numero(),
        "preguntas_sin_revisar": Numero(),
        "rotulo": Enumerado(frozenset(ROTULOS)),
    }
)
_METRICAS_DE_OPCIONES = Objeto(
    {
        nombre: Objeto({**campos, "validacion": _VALIDACION_DE_OPCIONES})
        for nombre, campos in _FAMILIA_DE_OPCIONES.items()
    }
)
_INVARIANTES_DE_OPCIONES = frozenset({"M-10.1", "M-10.2", "RN-24", "RN-28", "RN-28-no-comparable"})

ESQUEMA_OPCIONES = Objeto(
    {
        "esquema": Enumerado(frozenset({VERSION_ESQUEMA})),
        "suite": Enumerado(frozenset({"opciones"})),
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
                "maxOptions": Numero(),
                "modelos": _MODELOS_DE_OPCIONES,
                "umbrales": _UMBRALES,
                "versionListaTerminos": Identificador(),
            }
        ),
        "metricas": _METRICAS_DE_OPCIONES,
        # Qué alcanza la revisión humana: solo la pregunta de cada caso; las fuentes esperadas, el orden y las propuestas
        # los fija quien lee la regla, no un oncólogo.
        "alcance_de_la_revision": Enumerado(frozenset({"preguntas"})),
        # Las mismas métricas calculadas solo sobre los casos revisados por el oncólogo: la única cifra rotulada «validada».
        "metricas_validadas": _METRICAS_DE_OPCIONES,
        "invariantes": Objeto(
            {
                "cumplidas": Booleano(),
                "violaciones": Lista(
                    Objeto(
                        {
                            "invariante": Enumerado(_INVARIANTES_DE_OPCIONES),
                            "caso": Identificador(),
                            "detalle": Anulable(Identificador()),
                        }
                    )
                ),
            }
        ),
        "regresion": Objeto(
            {
                "reporte_referencia": Identificador(),
                "dataset_de_la_referencia": Identificador(),
                "tolerancia": Numero(),
                "metricas": Lista(
                    Objeto(
                        {
                            "metrica": Identificador(),
                            "valor": Numero(),
                            "referencia": Numero(),
                            "retroceso": Booleano(),
                        }
                    )
                ),
            }
        ),
        "metas": Objeto(
            {
                "origen": Enumerado(frozenset({"metas_iniciales_dec07_pendiente"})),
                "metricas": Lista(
                    Objeto(
                        {
                            "metrica": Identificador(),
                            "valor": Numero(),
                            "meta": Numero(),
                            "estado": Enumerado(
                                frozenset({"en_meta", "fuera_de_meta", "sin_medir"})
                            ),
                        }
                    )
                ),
            }
        ),
        "salidas_invalidas": _SALIDAS_INVALIDAS,
    },
    opcionales=frozenset({"salidas_invalidas"}),
)


# --- familia `diagnostico` (US-276, L1D-334): solo ids de par, de pregunta y de chunk, puestos, puntajes y recuentos -----

_ETAPA_DE_LA_CONSULTA = Enumerado(frozenset(ETAPAS_DE_LA_CONSULTA))
_FILA_DE_DIAGNOSTICO = Objeto(
    {
        "par": Identificador(),
        "redaccion": Identificador(),
        "pregunta_id": Identificador(),
        "idioma": Enumerado(frozenset(IDIOMAS)),
        "chunk_esperado": Anulable(Identificador()),
        # ``null`` = no observado (el chunk no llegó a esa etapa), nunca ``0`` ni ``0.0``.
        "puesto_denso": Numero(),
        "entro_en_pares": Anulable(Booleano()),
        "relevance_score": Numero(),
        "supero_umbral": Anulable(Booleano()),
        "con_evidencia": Booleano(),
        "opciones_generadas": Numero(),
        "opciones_mostradas": Numero(),
        "opciones_descartadas": Numero(),
        "afirmaciones_aprobadas": Numero(),
        "afirmaciones_descartadas": Numero(),
        "loops": Numero(),
    }
)
_PAR_DE_DIAGNOSTICO = Objeto(
    {
        "par": Identificador(),
        "tipo": Enumerado(frozenset(TIPOS_DE_VARIACION)),
        "resultado": Enumerado(
            frozenset({RESULTADO_PERDIDA, RESULTADO_SIN_PERDIDA, RESULTADO_SIN_ASIGNAR})
        ),
        "etapa": Anulable(_ETAPA_DE_LA_CONSULTA),
        "causa": Anulable(Enumerado(frozenset(CAUSAS_SIN_ASIGNAR))),
        "redaccion_perdida": Anulable(Identificador()),
    }
)

ESQUEMA_DIAGNOSTICO = Objeto(
    {
        "esquema": Enumerado(frozenset({VERSION_ESQUEMA})),
        "suite": Enumerado(frozenset({"diagnostico"})),
        "configuracion": Objeto(
            {
                "nombre": Identificador(),
                "hashConfig": Huella(),
                "fixture": Identificador(),
                "claseDataset": Enumerado(frozenset(CLASES_ADMITIDAS)),
                "dataset": Objeto({"nombre": Identificador(), "version": Identificador()}),
                # Los pares se comparan solo con el mismo corpus: se declara cuál fue ([S7 resp. 10]).
                "corpus": Objeto(
                    {
                        "nombre": Identificador(),
                        "version": Identificador(),
                        "release": Identificador(),
                        "recuento_de_chunks": Numero(),
                    }
                ),
                "proveedor": Enumerado(frozenset(PROVEEDORES)),
                "reloj": Enumerado(frozenset(RELOJES)),
                "catalogVersion": Identificador(),
                "modelos": _MODELOS_DE_OPCIONES,
                "umbrales": Objeto(
                    {
                        "relevanceThreshold": Numero(),
                        "nliEntailmentThreshold": Numero(),
                        "retrievalTopK": Numero(),
                        "rerankTopN": Numero(),
                        "rerankerMaxPairs": Numero(),
                    }
                ),
            }
        ),
        # Sin revisión de un oncólogo: el rótulo es siempre ``no_validada`` y el dataset declara quién lo revisó ([S7 resp. 1]).
        "validacion": _VALIDACION,
        "revision_provisional": Objeto(
            {
                "rol": Enumerado(frozenset(ROLES_DE_REVISION_PROVISIONAL)),
                "fecha": Identificador(),
            }
        ),
        "regla_de_asignacion": Lista(
            Objeto(
                {
                    "orden": Numero(),
                    "etapa": _ETAPA_DE_LA_CONSULTA,
                    "condicion": Enumerado(frozenset(CONDICIONES_DE_LA_REGLA)),
                }
            )
        ),
        "preguntas": Lista(_FILA_DE_DIAGNOSTICO),
        "pares": Lista(_PAR_DE_DIAGNOSTICO),
        "recuento_por_etapa": Objeto(
            {
                **{etapa: Numero() for etapa in ETAPAS_DE_LA_CONSULTA},
                RESULTADO_SIN_ASIGNAR: Numero(),
                RESULTADO_SIN_PERDIDA: Numero(),
            }
        ),
        "sin_asignar_por_causa": Objeto({causa: Numero() for causa in CAUSAS_SIN_ASIGNAR}),
        "nli": Objeto(
            {
                "umbral": Numero(),
                "banda_inferior": Numero(),
                "ancho_de_tramo": Numero(),
                "descartadas": Numero(),
                "tramos": Lista(
                    Objeto({"desde": Numero(), "hasta": Numero(), "recuento": Numero()})
                ),
                "en_banda": Numero(),
                "nota": Enumerado(frozenset({NOTA_DE_CALIBRACION})),
            }
        ),
        "salidas_invalidas": Numero(),
    }
)


# --- familia `contextual` (US-271 AC-9, L1D-329): solo ids de pregunta y de caso, estados, puntajes y recuentos -------------

_CAUSA_DE_SINONIMO = Anulable(Enumerado(frozenset(CAUSAS_DE_SINONIMO)))
_FILA_CONTEXTUAL = Objeto(
    {
        "pregunta_id": Identificador(),
        "clase": Enumerado(frozenset(CLASES_DE_PREGUNTA)),
        "caso": Identificador(),
        "estado": Enumerado(frozenset(ESTADOS_DE_FILA)),
        "supero_umbral": Booleano(),
        # ``null`` = ningún chunk superó el umbral (RN-02) o la salida del generador fue inválida; nunca ``0.0``.
        "top_relevance_score": Numero(),
        # ``null`` = no observado (salida inválida del generador).
        "segundo_loop": Anulable(
            Enumerado(frozenset({SEGUNDO_LOOP_CONTEXTUAL, SEGUNDO_LOOP_NINGUNO}))
        ),
        # Los tres primeros chunks del último ranking (id y puntaje; nunca el texto); vacío = el reranker no puntuó nada.
        "top3": Lista(Objeto({"chunk_id": Identificador(), "relevance_score": Numero()})),
        "campos_usados": Lista(Enumerado(frozenset(CAMPOS_DE_EXPANSION))),
        "llamadas_al_generador": Numero(),
    }
)
_COBERTURA_DE_CASO = Objeto(
    {
        "caso": Identificador(),
        "genericas_con_evidencia": Numero(),
        "genericas_total": Numero(),
        "minimo": Numero(),
        "cumple": Booleano(),
        "campos_usados": Lista(Enumerado(frozenset(CAMPOS_DE_EXPANSION))),
    }
)
_ADVERSARIAS_DE_CASO = Objeto(
    {
        "caso": Identificador(),
        "total": Numero(),
        "sin_evidencia": Numero(),
        "falsos_positivos": Numero(),
        "con_puntaje_nulo": Numero(),
        "llamadas_al_generador": Numero(),
    }
)
_COMPARACION_CON_LA_BASE = Anulable(
    Objeto(
        {
            "base": Objeto({"nombre": Identificador(), "hashConfig": Huella()}),
            "cambios": Lista(
                Objeto(
                    {
                        "ambito": Identificador(),
                        "metrica": Enumerado(frozenset(METRICAS_FRENTE_A_LA_BASE)),
                        "base": Numero(),
                        "actual": Numero(),
                        "empeora": Booleano(),
                    }
                )
            ),
            "empeoran": Numero(),
        }
    )
)

ESQUEMA_CONTEXTUAL = Objeto(
    {
        "esquema": Enumerado(frozenset({VERSION_ESQUEMA})),
        "suite": Enumerado(frozenset({"contextual"})),
        "configuracion": Objeto(
            {
                "nombre": Identificador(),
                "hashConfig": Huella(),
                "fixture": Identificador(),
                "claseDataset": Enumerado(frozenset(CLASES_ADMITIDAS)),
                # El corpus con el que corrió: base y final solo se comparan si coinciden ([S7 resp. 10]).
                "dataset": Objeto(
                    {"nombre": Identificador(), "version": Identificador(), "ruta": Identificador()}
                ),
                "corpus": Objeto(
                    {
                        "nombre": Identificador(),
                        "version": Identificador(),
                        "release": Identificador(),
                        "recuento_de_chunks": Numero(),
                    }
                ),
                "proveedor": Enumerado(frozenset(PROVEEDORES)),
                "reloj": Enumerado(frozenset(RELOJES)),
                "catalogVersion": Identificador(),
                "modelos": _MODELOS_DE_OPCIONES,
                "umbrales": Objeto(
                    {
                        "relevanceThreshold": Numero(),
                        "nliEntailmentThreshold": Numero(),
                        "retrievalTopK": Numero(),
                        "rerankTopN": Numero(),
                        "rerankerMaxPairs": Numero(),
                    }
                ),
                "expansion_habilitada": Booleano(),
                # Los campos del caso y el formato con los que corrió la expansión (solo se registran, no se configuran).
                "expansion": Objeto(
                    {
                        "campos": Lista(Enumerado(frozenset(CAMPOS_DE_EXPANSION))),
                        "formato": Enumerado(frozenset(FORMATOS_DE_CONSULTA)),
                    }
                ),
                "casos": Lista(Identificador()),
            }
        ),
        "validacion": _VALIDACION,
        "regla_de_la_causa": Lista(
            Objeto(
                {
                    "orden": Numero(),
                    "condicion": Enumerado(frozenset(CONDICIONES_DE_LA_CAUSA)),
                    "causa": _CAUSA_DE_SINONIMO,
                }
            )
        ),
        "preguntas": Lista(_FILA_CONTEXTUAL),
        "recuentos": Lista(
            Objeto(
                {
                    "ambito": Identificador(),
                    "clase": Enumerado(frozenset(CLASES_DE_PREGUNTA)),
                    "con_evidencia": Numero(),
                    "total": Numero(),
                    "superaron_umbral": Numero(),
                }
            )
        ),
        "cobertura": Lista(_COBERTURA_DE_CASO),
        "adversarias": Lista(_ADVERSARIAS_DE_CASO),
        "comparacion": _COMPARACION_CON_LA_BASE,
        "sinonimos": Lista(
            Objeto(
                {
                    "pregunta_id": Identificador(),
                    "caso": Identificador(),
                    "termino": Identificador(),
                    "supero_umbral": Booleano(),
                    "causa": _CAUSA_DE_SINONIMO,
                }
            )
        ),
        "salidas_invalidas": Numero(),
    }
)
