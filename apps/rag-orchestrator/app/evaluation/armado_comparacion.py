"""Arma la sección ``comparacion_recuperacion`` del reporte (US-133): agregados y configuración, nunca textos (RN-14)."""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.application.corpus_ingestion.contexto_llm import PROMPT_VERSION
from app.domain.corpus_seed.contexto_del_chunk import VERSION_DE_LA_PLANTILLA, VarianteDeContexto
from app.evaluation.adopcion_del_brazo import decidir_adopcion
from app.evaluation.brazos_contexto import (
    METRICA_DE_ADOPCION,
    DiferenciaPareada,
    diferencia_pareada,
    regla_de_adopcion,
)
from app.evaluation.brazos_recuperacion import (
    REFERENCIA,
    MetricasDeBrazo,
    diferencia_frente_referencia,
    marcar_retroceso,
    trazado_coherente,
)
from app.evaluation.config_suite import Comparacion, ConfigSuite
from app.evaluation.corrida_brazos import ResultadoDeBrazo
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.metricas.familias import familias_de_recuperacion
from app.evaluation.metricas.parafrasis import proporcion_de_parafrasis_recuperadas
from app.evaluation.viabilidad_del_brazo import viabilidad_del_brazo


def _o_none(valor: float) -> float | None:
    return None if math.isnan(valor) else valor


def _metricas_de(recuperacion: dict[str, Any]) -> MetricasDeBrazo:
    total, es_a_en = recuperacion["total"], recuperacion["es_a_en"]
    return MetricasDeBrazo(
        _o_none(total["recall_at_10"]), _o_none(es_a_en["recall_at_10"]), _o_none(total["mrr"])
    )


def _diferencia_a_dict(diferencia: MetricasDeBrazo) -> dict[str, float | None]:
    return {
        "recall_at_10_total": diferencia.recall_at_10_total,
        "recall_at_10_es_a_en": diferencia.recall_at_10_es_a_en,
        "mrr": diferencia.mrr,
    }


def _por_documento(brazo: ResultadoDeBrazo) -> list[dict[str, Any]]:
    """Recall@10 por documento esperado (ADR-45 P12): una conclusión no puede descansar en un solo documento."""
    recalls: dict[str, list[float]] = defaultdict(list)
    for r in brazo.resultados:
        for documento in r.recuperacion.documentos:
            if r.recuperacion.recall is not None:
                recalls[documento].append(r.recuperacion.recall)
    return [
        {"documento": d, "recall_at_10": statistics.mean(v), "n": len(v)}
        for d, v in sorted(recalls.items())
    ]


def _coherentes(brazo: ResultadoDeBrazo) -> int:
    return sum(
        trazado_coherente(
            brazo.brazo,
            meta.retrievalParams.retrievalMode,
            meta.retrievalParams.fusion,
            meta.retrievalParams.fusionParam,
        )
        for meta in brazo.metas
    )


def exigir_trazabilidad_coherente(brazo: ResultadoDeBrazo) -> None:
    """Toda consulta del brazo trajo el modo, la fusión y el parámetro de su brazo; si no, la corrida aborta."""
    if _coherentes(brazo) != len(brazo.metas):
        raise SuiteAbortada(
            f"el brazo {brazo.brazo.nombre} trajo consultas con retrievalParams de otro brazo"
        )


def _trazabilidad(brazo: ResultadoDeBrazo) -> dict[str, int]:
    """Cuántas consultas respondieron y cuántas trajeron en ``meta.retrievalParams`` la traza de su brazo."""
    return {"consultas": len(brazo.metas), "coherentes": _coherentes(brazo)}


def _sin_terminos(brazo: ResultadoDeBrazo) -> dict[str, float | int]:
    """Preguntas que cayeron en «sin términos léxicos» (ADR-48): ``0`` y ``0.0`` si ninguna, nunca ``null``."""
    total = len(brazo.resultados)
    return {
        "n": brazo.sin_terminos_lexicos,
        "proporcion": brazo.sin_terminos_lexicos / total if total else 0.0,
    }


# --- los brazos del reranker (US-278): solo aparecen si la comparación declara brazos que cambian la etapa del reranker ---------


def _falsos_sin_evidencia(brazo: ResultadoDeBrazo) -> dict[str, int]:
    """Preguntas con respuesta esperada que terminaron en ``sin_evidencia`` (RN-02), sobre las que tienen respuesta esperada."""
    con_respuesta = [r for r in brazo.resultados if not r.esperaba_sin_evidencia]
    return {"n": sum(r.sin_evidencia for r in con_respuesta), "total": len(con_respuesta)}


def _parafrasis_recuperadas(
    brazo: ResultadoDeBrazo, pares: Mapping[str, tuple[str, ...]]
) -> dict[str, int]:
    """Pares en los que TODAS las redacciones recuperan el fragmento esperado en el top 10 (``recall`` > 0, ``None`` no cuenta)."""
    recall = {r.recuperacion.id: r.recuperacion.recall for r in brazo.resultados}
    recuperadas = sum(
        all((recall.get(pregunta) or 0.0) > 0.0 for pregunta in preguntas)
        for preguntas in pares.values()
    )
    return {"pares": len(pares), "recuperadas": recuperadas}


def _latencia(brazo: ResultadoDeBrazo) -> dict[str, float | None]:
    """p95 de la etapa del reranker y de la consulta completa, en ms; ``None`` (≠ ``0.0``) si la etapa no se midió."""
    p95 = brazo.servicio.cronometro.p95_ms()
    return {"reranker_p95": p95["reranker"], "consulta_p95": p95["consulta"]}


def _etapa_del_informe(brazo: ResultadoDeBrazo) -> dict[str, Any] | None:
    """Modo, solape, largo y pares con los que corrió el brazo: el informe es el único lugar donde queda el modo (D4)."""
    c = brazo.reranker
    if c is None:
        return None
    return {
        "modo": c.modo,
        "solape": c.solape,
        "max_length": c.max_length,
        "max_pairs": c.max_pairs,
    }


def _restar_opcional(valor: float | None, referencia: float | None) -> float | None:
    return None if valor is None or referencia is None else valor - referencia


def _extras_del_reranker(
    brazo: ResultadoDeBrazo,
    comparacion: Comparacion,
    pares: Mapping[str, tuple[str, ...]],
    memoria_del_stack: Mapping[str, float],
) -> dict[str, Any]:
    viabilidad = comparacion.viabilidad
    if viabilidad is None:  # la carga de la configuración lo exige: no hay topes inventados
        raise SuiteAbortada("la comparación del reranker no trae los topes de viabilidad")
    latencia = _latencia(brazo)
    p95_s = None if latencia["consulta_p95"] is None else latencia["consulta_p95"] / 1000.0
    resultado = viabilidad_del_brazo(
        p95_consulta_s=p95_s,
        tope_p95_s=viabilidad.tope_p95_s,
        memoria_del_stack_gb=memoria_del_stack.get(brazo.brazo.nombre),
        limite_memoria_gb=viabilidad.limite_memoria_gb,
    )
    return {
        "reranker": _etapa_del_informe(brazo),
        "falsos_sin_evidencia": _falsos_sin_evidencia(brazo),
        "parafrasis": _parafrasis_recuperadas(brazo, pares),
        "latencia_ms": latencia,
        "viabilidad": {
            "estado": resultado.estado,
            "motivos": list(resultado.motivos),
            "p95_consulta_s": resultado.p95_consulta_s,
            "tope_p95_s": resultado.tope_p95_s,
            "memoria_gb": resultado.memoria_del_stack_gb,
            "limite_memoria_gb": resultado.limite_memoria_gb,
        },
    }


def _con_evidencia(brazo: ResultadoDeBrazo) -> dict[str, bool]:
    """Por pregunta: la evidencia esperada llegó al top 10 Y el umbral no la dejó sin evidencia (RN-02). Lo que se pierde antes de
    la generación (recuperación, corte de pares o umbral) es lo que la reescritura y los pares pueden recuperar (US-277 AC-2)."""
    return {
        r.recuperacion.id: (r.recuperacion.recall or 0.0) > 0.0 and not r.sin_evidencia
        for r in brazo.resultados
    }


def _extras_de_pares_y_reescritura(
    brazo: ResultadoDeBrazo, referencia: ResultadoDeBrazo, pares: Mapping[str, tuple[str, ...]]
) -> dict[str, Any]:
    """Lo que dice el informe de un brazo de US-277: la reescritura que realmente corrió y la proporción de pares perdidos en la
    referencia que el brazo recupera (``proporcion`` ``None`` = sin pares aplicables, no ``0.0``)."""
    proporcion = proporcion_de_parafrasis_recuperadas(
        pares, _con_evidencia(referencia), _con_evidencia(brazo)
    )
    return {
        "reescritura": {
            "habilitada": brazo.servicio.observaciones.reescritura_esperada is True,
            "invocaciones": brazo.servicio.observaciones.reescrituras,
        },
        "parafrasis_atribuidas": {
            "aplicables": proporcion.aplicables,
            "recuperadas": proporcion.recuperadas,
            "proporcion": proporcion.proporcion,
            "sin_pares_aplicables": proporcion.sin_pares_aplicables,
        },
    }


def _tasa_de_falsos_sin_evidencia(armado: dict[str, Any]) -> float | None:
    falsos = armado["falsos_sin_evidencia"]
    return falsos["n"] / falsos["total"] if falsos["total"] else None


def _adopcion_del_brazo(
    armado: dict[str, Any], referencia: dict[str, Any], tolerancia: float
) -> dict[str, Any]:
    """US-277 AC-5: ``adoptable`` frente a la referencia, con los motivos de no serlo."""
    aumento_de_falsos = _restar_opcional(
        _tasa_de_falsos_sin_evidencia(armado), _tasa_de_falsos_sin_evidencia(referencia)
    )
    decision = decidir_adopcion(
        retroceso=armado["retroceso"],
        aumento_de_falsos_sin_evidencia=aumento_de_falsos,
        tolerancia=tolerancia,
        viabilidad=armado["viabilidad"]["estado"],
    )
    return {"adoptable": decision.adoptable, "motivos": list(decision.motivos)}


def _diferencias_extra(
    armado: dict[str, Any], referencia: dict[str, Any]
) -> dict[str, float | None]:
    return {
        "falsos_sin_evidencia": armado["falsos_sin_evidencia"]["n"]
        - referencia["falsos_sin_evidencia"]["n"],
        "parafrasis_recuperadas": armado["parafrasis"]["recuperadas"]
        - referencia["parafrasis"]["recuperadas"],
        "p95_reranker_ms": _restar_opcional(
            armado["latencia_ms"]["reranker_p95"], referencia["latencia_ms"]["reranker_p95"]
        ),
        "p95_consulta_ms": _restar_opcional(
            armado["latencia_ms"]["consulta_p95"], referencia["latencia_ms"]["consulta_p95"]
        ),
    }


# --- las variantes de contexto del chunk (US-279 AC-5): solo aparecen si la comparación declara brazos con CORPUS_CHUNK_CONTEXT -------


def _recall_y_rr_por_pregunta(
    brazo: ResultadoDeBrazo,
) -> tuple[dict[str, float | None], dict[str, float | None]]:
    """Por pregunta: el recall@10 y el rr del brazo (``None`` = sin respuesta esperada); las preguntas se parean por id."""
    return (
        {r.recuperacion.id: r.recuperacion.recall for r in brazo.resultados},
        {r.recuperacion.id: r.recuperacion.rr for r in brazo.resultados},
    )


def _intervalo_a_dict(d: DiferenciaPareada) -> dict[str, Any]:
    return {"diferencia": d.diferencia, "ic95": {"inferior": d.inferior, "superior": d.superior}}


def _diferencia_pareada_del_brazo(
    config: ConfigSuite, brazo: ResultadoDeBrazo, referencia: ResultadoDeBrazo
) -> dict[str, DiferenciaPareada]:
    """Brazo menos ``ninguno`` sobre las MISMAS preguntas, con su intervalo pareado (el de recall decide la regla; el de MRR se informa)."""
    recall, rr = _recall_y_rr_por_pregunta(brazo)
    recall_a0, rr_a0 = _recall_y_rr_por_pregunta(referencia)
    semilla, repeticiones = config.semilla_bootstrap, config.bootstrap_repeticiones
    return {
        METRICA_DE_ADOPCION: diferencia_pareada(
            recall, recall_a0, semilla=semilla, repeticiones=repeticiones
        ),
        "mrr": diferencia_pareada(rr, rr_a0, semilla=semilla + 1, repeticiones=repeticiones),
    }


def _entero_o_none(resumen: Mapping[str, Any] | None, clave: str) -> int | None:
    valor = None if resumen is None else resumen.get(clave)
    return valor if isinstance(valor, int) and not isinstance(valor, bool) else None


def _indice_del_brazo(
    brazo: ResultadoDeBrazo, resumen: Mapping[str, Any] | None
) -> dict[str, float | int | None]:
    """Lo que costó construir el índice del brazo y cuántos chunks vigentes cubre: de la suite si lo construyó en memoria (la CI), del
    resumen de ``reindex-context`` si lo leyó de Milvus (``--resumenes-de-contexto``); ``None`` = no medido, nunca ``0.0``."""
    if brazo.indice_en_memoria is not None:
        return {
            "construccion_s": brazo.indice_en_memoria.construccion_s,
            "chunks_vigentes": brazo.indice_en_memoria.chunks,
        }
    duracion = None if resumen is None else resumen.get("duracion_s")
    return {
        "construccion_s": float(duracion) if isinstance(duracion, int | float) else None,
        "chunks_vigentes": None if brazo.indice is None else brazo.indice.resumen.chunks_vigentes,
    }


def _llm_del_brazo(
    config: ConfigSuite, brazo: ResultadoDeBrazo, resumen: Mapping[str, Any] | None
) -> dict[str, Any]:
    """El modelo, la versión del prompt y los chunks con respaldo determinista de la variante ``llm`` (el brazo no es reproducible byte a byte)."""
    en_memoria = brazo.indice_en_memoria
    return {
        "modelo": config.llm_modelo,
        "version_del_prompt": PROMPT_VERSION,
        "chunks_con_respaldo": {
            "salida_invalida": en_memoria.respaldo_por_salida_invalida
            if en_memoria
            else _entero_o_none(resumen, "con_respaldo_por_salida_invalida"),
            "llm_no_disponible": en_memoria.respaldo_por_llm_no_disponible
            if en_memoria
            else _entero_o_none(resumen, "con_respaldo_por_llm_no_disponible"),
        },
    }


def _p95_de_consulta_s(armado: dict[str, Any]) -> float | None:
    p95_ms = armado["latencia_ms"]["consulta_p95"]
    return None if p95_ms is None else p95_ms / 1000.0


def _contexto_del_brazo(
    config: ConfigSuite,
    comparacion: Comparacion,
    brazo: ResultadoDeBrazo,
    referencia: ResultadoDeBrazo,
    armado: dict[str, Any],
    resumen: Mapping[str, Any] | None,
) -> dict[str, Any]:
    """Lo que el informe dice de un brazo de contexto: variante, plantilla, colección, costo del índice y, fuera de la referencia, la
    diferencia pareada frente a ``ninguno`` y la marca de la regla de adopción (que NO adopta nada)."""
    variante = brazo.brazo.contexto
    contexto: dict[str, Any] = {
        "variante": None if variante is None else variante.value,
        "version_de_la_plantilla": VERSION_DE_LA_PLANTILLA,
        "coleccion": None if brazo.indice is None else brazo.indice.resumen.coleccion,
        "indice": _indice_del_brazo(brazo, resumen),
    }
    if variante is VarianteDeContexto.LLM:
        contexto["llm"] = _llm_del_brazo(config, brazo, resumen)
    if brazo is not referencia and comparacion.viabilidad is not None:
        diferencias = _diferencia_pareada_del_brazo(config, brazo, referencia)
        contexto["diferencia_pareada"] = {k: _intervalo_a_dict(d) for k, d in diferencias.items()}
        regla = regla_de_adopcion(
            inferior=diferencias[METRICA_DE_ADOPCION].inferior,
            p95_consulta_s=_p95_de_consulta_s(armado),
            tope_p95_s=comparacion.viabilidad.tope_p95_s,
        )
        contexto["regla_de_adopcion"] = {"cumple": regla.cumple, "motivos": list(regla.motivos)}
    return contexto


def _seccion_de_contexto(comparacion: Comparacion, referencia: ResultadoDeBrazo) -> dict[str, Any]:
    """La colección de origen de las reindexaciones (la de ``ninguno``, el mismo corpus de la corrida base, ``[S7 resp. 10]``) y la regla."""
    return {
        "coleccion_de_origen": None
        if referencia.indice is None
        else referencia.indice.resumen.coleccion,
        "metrica_de_adopcion": METRICA_DE_ADOPCION,
        "tope_p95_s": None if comparacion.viabilidad is None else comparacion.viabilidad.tope_p95_s,
    }


@dataclass(frozen=True)
class ComparacionArmada:
    seccion: dict[str, Any]
    """La sección ``comparacion_recuperacion`` del reporte."""
    retroceso: bool
    """Algún brazo híbrido retrocedió frente a A0: decide el código de salida sin releer el reporte."""


def _datos_del_brazo(brazo: ResultadoDeBrazo, recuperacion: dict[str, Any]) -> dict[str, Any]:
    """Lo que el informe dice de un brazo antes de compararlo con la referencia: su configuración y sus métricas."""
    modo, fusion, parametro = brazo.brazo.trazado_esperado()
    return {
        "nombre": brazo.brazo.nombre,
        "retrievalMode": modo.value,
        "fusion": fusion.value,
        "fusionParam": parametro,
        "huellaConfig": brazo.brazo.huella(),
        "recuperacion": recuperacion,
        "retroceso": False,
        "trazabilidad": _trazabilidad(brazo),
        "sin_terminos_lexicos": _sin_terminos(brazo),
        "por_documento": _por_documento(brazo),
    }


def armar_comparacion(
    config: ConfigSuite,
    comparacion: Comparacion,
    brazos: Sequence[ResultadoDeBrazo],
    *,
    pares_de_parafrasis: Mapping[str, tuple[str, ...]] | None = None,
    memoria_del_stack: Mapping[str, float] | None = None,
    corpus: Mapping[str, Any] | None = None,
    resumenes_de_contexto: Mapping[str, Mapping[str, Any]] | None = None,
) -> ComparacionArmada:
    for brazo in brazos:
        exigir_trazabilidad_coherente(brazo)  # antes de armar ningún dato
    recuperaciones = [
        familias_de_recuperacion(
            b.resultados, config.semilla_bootstrap, config.bootstrap_repeticiones
        )
        for b in brazos
    ]
    referencia = _metricas_de(recuperaciones[0])
    armados: list[dict[str, Any]] = []
    con_viabilidad = comparacion.viabilidad is not None
    con_pares_o_reescritura = con_viabilidad and any(
        b.brazo.declara_pares_o_reescritura for b in brazos
    )
    con_contexto = any(b.brazo.declara_contexto for b in brazos)
    for b, recuperacion in zip(brazos, recuperaciones, strict=True):
        armado = _datos_del_brazo(b, recuperacion)
        if con_viabilidad:
            armado.update(
                _extras_del_reranker(
                    b, comparacion, pares_de_parafrasis or {}, memoria_del_stack or {}
                )
            )
        if con_pares_o_reescritura:
            armado.update(_extras_de_pares_y_reescritura(b, brazos[0], pares_de_parafrasis or {}))
        if con_contexto:
            armado["contexto"] = _contexto_del_brazo(
                config,
                comparacion,
                b,
                brazos[0],
                armado,
                (resumenes_de_contexto or {}).get(b.brazo.nombre),
            )
        if b.brazo.nombre != REFERENCIA:
            diferencia = diferencia_frente_referencia(_metricas_de(recuperacion), referencia)
            armado["diferencia_frente_a_a0"] = _diferencia_a_dict(diferencia)
            if con_viabilidad:
                armado["diferencia_frente_a_a0"].update(_diferencias_extra(armado, armados[0]))
            armado["retroceso"] = marcar_retroceso(diferencia, comparacion.tolerancia_retroceso)
            if con_pares_o_reescritura:
                armado["adopcion"] = _adopcion_del_brazo(
                    armado, armados[0], comparacion.tolerancia_retroceso
                )
        armados.append(armado)
    hay_retroceso = any(a["retroceso"] for a in armados)
    seccion = {
        "referencia": REFERENCIA,
        "tolerancia_retroceso": comparacion.tolerancia_retroceso,
        "retroceso": hay_retroceso,
        "brazos": armados,
        **({} if corpus is None else {"corpus": dict(corpus)}),
        **({"contexto": _seccion_de_contexto(comparacion, brazos[0])} if con_contexto else {}),
    }
    return ComparacionArmada(seccion, hay_retroceso)
