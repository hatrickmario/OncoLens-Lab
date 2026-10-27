"""Corrida de la familia `aplicabilidad` de `evaluate` (US-132, L1D-244).

Evalúa la aplicabilidad en proceso por par paciente-fuente (``ApplicabilityService`` + ``AplicabilidadTextual`` reales con
el proponente, el NLI y el catálogo del corpus falsos), mide la concordancia de estados, M-08.2, M-08.3, M-08.4 y M-08.6,
escribe el reporte cerrado y, si una invariante vale más que cero, sale con el código 3. Códigos: 0 correcto · 1 la suite
no corre · 2 configuración o entrada inválida · 3 invariante violada. Solo agregados en el reporte (RN-14).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from app.application.aplicabilidad import ApplicabilityService, mejor_chunk_por_documento
from app.application.aplicabilidad_textual import AplicabilidadTextual
from app.application.chunk_citable import ChunkCitable
from app.application.contexto_del_paciente import contexto_del_paciente
from app.application.ports import Clock, CoberturaDePoblacion, LectorDeCoberturaDePoblacion
from app.application.verificacion_de_soporte import VerificadorDeSoporte
from app.domain.aplicabilidad_tipos import CriterioEvaluado, PoblacionDelEstudio
from app.domain.citations import FichaDeFuente
from app.domain.cobertura_poblacion import proporcion_con_criterios
from app.domain.relevance import ChunkPuntuado
from app.evaluation.adaptadores_falsos import CoberturaEnMemoria, NliGuionado, ProponenteGuionado
from app.evaluation.config_aplicabilidad import ConfigAplicabilidad, cargar_config_aplicabilidad
from app.evaluation.config_suite import ConfigInvalida
from app.evaluation.dataset_aplicabilidad import (
    CriteriosPorTipo,
    DatasetAplicabilidad,
    FuenteDelDataset,
    Guion,
    ParDelDataset,
    cargar_criterios,
    cargar_dataset_aplicabilidad,
    exigir_claves_resolubles,
)
from app.evaluation.esquema_suite import ESQUEMA_APLICABILIDAD, VERSION_ESQUEMA
from app.evaluation.metricas.aplicabilidad import (
    METRICA_COINCIDE_SIN_CITA,
    METRICA_VALORES_NO_COPIADOS,
    Concordancia,
    ParEvaluado,
    coincide_sin_cita,
    concordancia_de_estados,
    marca_frente_a_meta,
    valores_no_copiados,
    veredicto_de_invariantes,
)
from app.evaluation.revision_muestra import ResultadoDeRevision, leer_revision
from app.evaluation.reporte import escribir_reporte_cerrado
from app.evaluation.rutas import raiz_repo
from app.infrastructure.lenguaje.terminos_prohibidos import (
    VerificadorDeTerminosProhibidos,
    cargar_lista_de_terminos,
)

SUITE_APLICABILIDAD = "aplicabilidad"
CODIGO_INVARIANTE_VIOLADA = 3
SALIDA_POR_DEFECTO = Path("eval") / "results"
TRAZA_DE_LA_SUITE = "evaluate-aplicabilidad"

Evaluador = Callable[[ConfigAplicabilidad, DatasetAplicabilidad], Sequence[ParEvaluado]]


@dataclass(frozen=True)
class PuertosDeAplicabilidad:
    """Bordes que un test puede sustituir; sin ellos la familia compone los adaptadores falsos de la configuración."""

    evaluador: Evaluador | None = None
    lector_cobertura: LectorDeCoberturaDePoblacion | None = None


def ejecutar_aplicabilidad(
    args: argparse.Namespace, reloj: Clock, puertos: PuertosDeAplicabilidad
) -> int:
    try:
        return _correr(args, reloj, puertos)
    except (
        ConfigInvalida
    ) as error:  # el mensaje nombra la clave, el documento o el campo; nunca un valor (RN-14)
        print(f"evaluate: configuración o entrada inválida: {error}", file=sys.stderr)
        return 2


def _correr(args: argparse.Namespace, reloj: Clock, puertos: PuertosDeAplicabilidad) -> int:
    config = cargar_config_aplicabilidad(args.config, args.corpus_cutoff_date)
    if config.proveedor != "fake":
        raise ConfigInvalida("adaptadores.proveedor: local se cablea con US-233")
    dataset = cargar_dataset_aplicabilidad(
        config.dataset
    )  # se niega si no es sintético, antes de medir
    exigir_claves_resolubles(dataset, cargar_criterios(dataset))
    pares = (puertos.evaluador or _evaluador_falso(reloj))(config, dataset)
    cobertura = (puertos.lector_cobertura or _cobertura_falsa(config)).cobertura()
    revision = leer_revision(config.revision)
    reporte = _reporte(config, dataset, pares, cobertura, revision)
    escribir_reporte_cerrado(
        _ruta_del_resultado(config, args, reloj), reporte, ESQUEMA_APLICABILIDAD
    )
    return _veredicto(reporte)


def _evaluador_falso(reloj: Clock) -> Evaluador:
    return lambda config, dataset: asyncio.run(evaluar_pares(config, dataset, reloj))


def _cobertura_falsa(config: ConfigAplicabilidad) -> LectorDeCoberturaDePoblacion:
    if config.catalogo_en_memoria is None:
        raise ConfigInvalida("falta la clave corpus.catalogo_en_memoria")
    return CoberturaEnMemoria(config.catalogo_en_memoria)


# --- evaluación de los pares ---------------------------------------------------------------------------------------


async def evaluar_pares(
    config: ConfigAplicabilidad, dataset: DatasetAplicabilidad, reloj: Clock
) -> list[ParEvaluado]:
    criterios = cargar_criterios(dataset)
    terminos = VerificadorDeTerminosProhibidos(cargar_lista_de_terminos(config.ruta_terminos))
    return [
        await _evaluar_par(par, dataset, criterios, terminos, config.umbral_nli, reloj)
        for par in dataset.pares
    ]


async def _evaluar_par(
    par: ParDelDataset,
    dataset: DatasetAplicabilidad,
    criterios: CriteriosPorTipo,
    terminos: VerificadorDeTerminosProhibidos,
    umbral_nli: float,
    reloj: Clock,
) -> ParEvaluado:
    fuente = dataset.fuentes[par.fuente]
    guion = dataset.guiones[par.guion]
    contexto = contexto_del_paciente(dataset.contextos[par.paciente])
    servicio = ApplicabilityService(criterios)
    citables = _citables_de(fuente)
    estructurada = servicio.evaluar(
        fuente.tipo_de_cancer,
        contexto,
        mejor_chunk_por_documento(citables),
        {
            fuente.document_id: PoblacionDelEstudio(
                fuente.metadata_source, fuente.population_criteria
            )
        },  # type: ignore[arg-type]
    )
    textual = _servicio_textual(fuente, guion, servicio, terminos, umbral_nli, reloj)
    completa = await textual.completar(
        TRAZA_DE_LA_SUITE, fuente.tipo_de_cancer, estructurada, citables
    )
    evaluados: tuple[CriterioEvaluado, ...] = tuple(
        c for f in completa.fuentes for c in f.criterios
    )
    return ParEvaluado(
        id=par.id,
        esperados=par.esperados,
        criterios=evaluados,
        contexto=contexto,
        chunk_ids_de_la_fuente=frozenset(c.chunk_id for c in fuente.chunks),
        catalogo={c.clave: c for c in criterios.criterios(fuente.tipo_de_cancer)},
        omitidas=completa.omitidas,
    )


def _servicio_textual(
    fuente: FuenteDelDataset,
    guion: Guion,
    servicio: ApplicabilityService,
    terminos: VerificadorDeTerminosProhibidos,
    umbral_nli: float,
    reloj: Clock,
) -> AplicabilidadTextual:
    """El camino textual real con el LLM y el NLI falsos que dicta el guion del par."""
    return AplicabilidadTextual(
        proponente=ProponenteGuionado(
            fuente.external_id, [(p.criterio, p.valor, p.chunk_id) for p in guion.propuestas]
        ),
        soporte=VerificadorDeSoporte(
            clasificador=NliGuionado(guion.nli), terminos=terminos, umbral=umbral_nli, reloj=reloj
        ),
        terminos=terminos,
        criterios_del=servicio.criterios_del,
        reloj=reloj,
    )


def _citables_de(fuente: FuenteDelDataset) -> dict[str, ChunkCitable]:
    ficha = _ficha_de(fuente)
    return {
        c.chunk_id: ChunkCitable(
            ChunkPuntuado(c.chunk_id, fuente.document_id, c.texto, c.relevance_score), ficha
        )
        for c in fuente.chunks
    }


def _ficha_de(fuente: FuenteDelDataset) -> FichaDeFuente:
    corte = date(2026, 1, 1)
    return FichaDeFuente(
        title=fuente.titulo,
        source_name="Corpus sintético (test)",
        external_id=fuente.external_id,
        language="en",
        source_type="guideline",
        license_class="dominio_publico",
        study_design=None,
        trial_phase=None,
        primary_endpoint=None,
        sample_size=None,
        published_at=corte,
        last_updated_at=corte,
        guideline_version=None,
        authors=None,
        source_url=None,
    )


# --- reporte -------------------------------------------------------------------------------------------------------


def _reporte(
    config: ConfigAplicabilidad,
    dataset: DatasetAplicabilidad,
    pares: Sequence[ParEvaluado],
    cobertura: CoberturaDePoblacion,
    revision: ResultadoDeRevision,
) -> dict[str, Any]:
    return {
        "esquema": VERSION_ESQUEMA,
        "suite": SUITE_APLICABILIDAD,
        "configuracion": _configuracion(config, dataset),
        "metricas": {
            "aplicabilidad": _metricas_de_pares(pares),
            "cobertura_poblacion": _metricas_de_cobertura(config, cobertura),
            "exactitud_extraido_verificado": _metricas_de_exactitud(config, revision),
        },
    }


def _configuracion(config: ConfigAplicabilidad, dataset: DatasetAplicabilidad) -> dict[str, Any]:
    return {
        "nombre": config.nombre,
        "hashConfig": config.hash_config,
        "fixture": config.fixture,
        "claseDataset": dataset.clase,
        "dataset": {"nombre": dataset.nombre, "version": dataset.version},
        "proveedor": config.proveedor,
        "reloj": config.reloj,
        "catalogVersion": dataset.catalog_version,
        "umbrales": {"nliEntailmentThreshold": config.umbral_nli},
    }


def _metricas_de_pares(pares: Sequence[ParEvaluado]) -> dict[str, Any]:
    total = Concordancia(0, 0)
    detalle: list[dict[str, Any]] = []
    sin_cita = no_copiados = 0
    for par in pares:
        concordancia = concordancia_de_estados(par.esperados, par.criterios)
        total = Concordancia(
            total.aciertos + concordancia.aciertos, total.total + concordancia.total
        )
        sin_cita += coincide_sin_cita(par.criterios, par.chunk_ids_de_la_fuente)
        no_copiados += valores_no_copiados(par.criterios, par.contexto, par.catalogo)
        detalle.append(_detalle_del_par(par, concordancia))
    return {
        "pares": detalle,
        "concordancia_de_estados": {
            "aciertos": total.aciertos,
            "total": total.total,
            "valor": None if total.total == 0 else total.aciertos / total.total,
        },
        METRICA_COINCIDE_SIN_CITA: sin_cita,
        METRICA_VALORES_NO_COPIADOS: no_copiados,
        "omitidas": sum(p.omitidas for p in pares),
    }


def _detalle_del_par(par: ParEvaluado, concordancia: Concordancia) -> dict[str, Any]:
    cuentas = {estado: 0 for estado in ("coincide", "parcial", "no_coincide", "desconocido")}
    for criterio in par.criterios:
        cuentas[criterio.estado] += 1
    return {"id": par.id, **cuentas, "acierto": concordancia.aciertos == concordancia.total}


def _metricas_de_cobertura(
    config: ConfigAplicabilidad, cobertura: CoberturaDePoblacion
) -> dict[str, Any]:
    valor = proporcion_con_criterios(cobertura.vigentes, cobertura.con_criterios)
    return {
        "version": config.fecha_de_corte.isoformat(),
        "vigentes": cobertura.vigentes,
        "con_criterios": cobertura.con_criterios,
        "valor": valor,
        "meta": config.meta_cobertura,
        "marca": marca_frente_a_meta(valor, config.meta_cobertura),
    }


def _metricas_de_exactitud(
    config: ConfigAplicabilidad, revision: ResultadoDeRevision
) -> dict[str, Any]:
    medidas: dict[str, Any] = {
        "documentos": revision.documentos,
        "revisados": revision.revisados,
        "correctos": revision.correctos,
        "pendientes": revision.pendientes,
        "valor": revision.exactitud,
        "meta": config.meta_exactitud,
        "marca": marca_frente_a_meta(revision.exactitud, config.meta_exactitud),
    }
    return medidas if revision.causa is None else {**medidas, "causa": revision.causa}


def _ruta_del_resultado(
    config: ConfigAplicabilidad, args: argparse.Namespace, reloj: Clock
) -> Path:
    carpeta = args.salida or raiz_repo() / "apps" / "rag-orchestrator" / SALIDA_POR_DEFECTO
    return carpeta / (
        args.nombre_archivo
        or f"{reloj.ahora().date().isoformat()}-{config.hash_config}-{SUITE_APLICABILIDAD}.json"
    )


def _veredicto(reporte: dict[str, Any]) -> int:
    medidas = reporte["metricas"]["aplicabilidad"]
    violadas = veredicto_de_invariantes(
        medidas[METRICA_COINCIDE_SIN_CITA], medidas[METRICA_VALORES_NO_COPIADOS]
    )
    if not violadas:
        return 0
    print(f"evaluate: invariante violada: {', '.join(violadas)}", file=sys.stderr)
    return CODIGO_INVARIANTE_VIOLADA
