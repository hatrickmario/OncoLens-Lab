"""Corrida de la familia `poblacion` de `evaluate` (L1D-299, US-233b).

Mide la extracción de población en abanico de US-242 contra el conjunto dorado: precisión y cobertura por criterio
(M-08.3, M-08.4), duplicados, ``finish_reason = length`` (ADR47-R4), concordancia de los estados F-20…F-24 con las reglas
de US-243 (M-08.2, ADR47-R1/R2), regresión de «sin evidencia» (RN-02) y la repetición del bucle (OUT-06, ADR47-R17).

El extractor es el de producción (``extractor_de_poblacion``) con el LLM y el NLI falsos que dicta el dorado; las reglas
de estado son las reales. Códigos: 0 correcto · 1 la suite no corre · 2 configuración inválida · 3 invariante violada.
Solo agregados e identificadores del corpus público en el reporte (RN-14, D7).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.application.corpus_metadata.poblacion_puertos import DocumentoParaExtraer, Fragmento
from app.application.corpus_metadata.esquema_poblacion import cargar_plantilla
from app.application.corpus_metadata.population_fanout import (
    ConfiguracionDePoblacion,
    PopulationFanoutExtractor,
)
from app.application.ports import Clock
from app.domain.aplicabilidad_tipos import CriterioDePoblacion, ValorDePoblacion
from app.domain.applicability_rules import estado_de_poblacion
from app.domain.clasificacion_de_poblacion import valores_de_la_opcion
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.domain.lenguaje import normalizar_texto
from app.evaluation.adaptadores_falsos import NliGuionado
from app.evaluation.adaptadores_poblacion import LlmGuionadoDePoblacion
from app.evaluation.config_poblacion import ConfigPoblacion, cargar_config_poblacion
from app.evaluation.config_suite import ConfigInvalida
from app.evaluation.dataset_poblacion import (
    CasoDeEstadoDorado,
    DoradoDePoblacion,
    ParDelBucle,
    ParDorado,
    ValorEsperado,
    cargar_dorado,
)
from app.evaluation.esquema_suite import ESQUEMA_POBLACION, VERSION_ESQUEMA
from app.evaluation.metricas.aplicabilidad import marca_frente_a_meta
from app.evaluation.metricas.poblacion import (
    CasoDeEstado,
    Fraccion,
    ParMedido,
    cobertura_por_criterio,
    concordancia_de_estados,
    cortes_por_longitud,
    precision_por_criterio,
    sin_evidencia_vs_baseline,
    tasa_cortes_del_bucle,
    tasa_duplicados,
    veredicto,
)
from app.evaluation.reporte import escribir_reporte_cerrado
from app.evaluation.rutas import raiz_repo
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from app.infrastructure.catalogo_clinico.manifiesto import cargar_catalogo_del_manifiesto
from app.infrastructure.catalogo_clinico.sinonimos import cargar_sinonimos
from app.infrastructure.corpus_metadata.recuperador_lexical import RecuperadorLexicalDeFragmentos
from app.infrastructure.lenguaje.terminos_prohibidos import cargar_verificador_de_terminos

SUITE_POBLACION = "poblacion"
CODIGO_INVARIANTE_VIOLADA = 3
SALIDA_POR_DEFECTO = Path("eval") / "results"
MARCA_NO_CONCLUYENTE = "no_concluyente"
NOMBRE_DEL_LLM_FALSO = "llm-falso-de-poblacion"
VERSION_DEL_PROMPT = "poblacion_v1"
CAMPO_DE_VALOR_GENERADO = (
    "studyPopulationValues[].value"  # el campo RN-23 que muestra el valor extraído
)


@dataclass(frozen=True)
class MedicionSinEvidencia:
    """Lo que la suite `all` mide de «sin evidencia» (RN-02): la exactitud y las violaciones del camino sin evidencia."""

    exactitud: float | None
    violaciones_rn02: int
    """Respuestas sin evidencia que invocaron al LLM o dejaron ``top_relevance_score`` distinto de ``null``."""


@dataclass(frozen=True)
class PuertosDePoblacion:
    """Bordes que un test puede sustituir; sin ellos la familia mide «sin evidencia» corriendo la suite `all`."""

    medidor_sin_evidencia: Callable[[Path], MedicionSinEvidencia] | None = None


@dataclass(frozen=True)
class _Extraccion:
    """Lo que la extracción guardó por documento y las tareas del LLM (documento, criterio, finish_reason)."""

    guardado: Mapping[str, Mapping[str, Any]]
    tareas: tuple[tuple[str, str, str], ...]


def ejecutar_poblacion(args: argparse.Namespace, reloj: Clock, puertos: PuertosDePoblacion) -> int:
    try:
        return _correr(args, reloj, puertos)
    except ConfigInvalida as error:  # el mensaje nombra la clave; nunca un valor (RN-14)
        print(f"evaluate: configuración o entrada inválida: {error}", file=sys.stderr)
        return 2


def _correr(args: argparse.Namespace, reloj: Clock, puertos: PuertosDePoblacion) -> int:
    config = cargar_config_poblacion(args.config)
    if config.proveedor != "fake":
        raise ConfigInvalida("adaptadores.proveedor: local se cablea con la medición real (2.1)")
    dorado = cargar_dorado(config.dataset, config.licencias_aceptadas)  # se niega antes de medir
    if puertos.medidor_sin_evidencia is None:
        raise ConfigInvalida("falta el medidor de «sin evidencia»")
    reporte, cortes = _reporte(config, dorado, puertos.medidor_sin_evidencia)
    escribir_reporte_cerrado(_ruta_del_resultado(config, args, reloj), reporte, ESQUEMA_POBLACION)
    return _codigo_de_salida(reporte, cortes)


# --- extracción ----------------------------------------------------------------------------------------------------


def _extractor(config: ConfigPoblacion, llm: LlmGuionadoDePoblacion) -> PopulationFanoutExtractor:
    """El extractor de producción (``PopulationFanoutExtractor``) con las mismas piezas que la raíz de composición de la
    ingesta (catálogo, sinónimos, términos prohibidos, plantilla versionada), pero con el LLM y el NLI falsos; los
    parámetros salen de la configuración (RN-22)."""
    extraccion = config.extraccion
    catalogo = cargar_catalogo_del_manifiesto(config.catalogo)
    tipos = catalogo.tipos_de_cancer()
    verificador = cargar_verificador_de_terminos(config.catalogo)
    return PopulationFanoutExtractor(
        llm=llm,
        nli=NliGuionado("entailment"),
        recuperador=RecuperadorLexicalDeFragmentos(),
        criterios=cargar_criterios_de_aplicabilidad(config.catalogo, tipos),
        plantilla_del_prompt=cargar_plantilla(VERSION_DEL_PROMPT),
        sinonimos=cargar_sinonimos(config.catalogo, tipos),
        buscar_terminos_prohibidos=lambda texto: verificador.reglas_coincidentes(
            texto, CAMPO_DE_VALOR_GENERADO
        ),
        configuracion=ConfiguracionDePoblacion(
            top_k=extraccion.top_k,
            max_valores_por_criterio=extraccion.max_valores_por_criterio,
            max_tokens_de_salida=extraccion.max_tokens_de_salida,
            concurrencia=extraccion.concurrencia,
            reintentos=extraccion.reintentos,
            version_del_prompt=VERSION_DEL_PROMPT,
            version_del_modelo=NOMBRE_DEL_LLM_FALSO,
            version_del_catalogo=catalogo.version(),
            umbral_nli=config.umbral_nli,
        ),
    )


def _extraer(
    config: ConfigPoblacion,
    fuentes: Sequence[
        tuple[
            str, str, Sequence[Fragmento], Mapping[str, Sequence[ValorEsperado]], Mapping[str, int]
        ]
    ],
) -> _Extraccion:
    """Una extracción por documento: (id, tipo de cáncer, fragmentos, propuestas por criterio, cortes por criterio)."""
    guardado: dict[str, Mapping[str, Any]] = {}
    tareas: list[tuple[str, str, str]] = []
    for documento, tipo, fragmentos, propuestas, cortes in fuentes:
        llm = LlmGuionadoDePoblacion(documento, propuestas, cortes)
        extraida = _extractor(config, llm).extraer(
            DocumentoParaExtraer(documento, documento, tuple(fragmentos)), (tipo,), None
        )
        guardado[documento] = extraida.population_criteria
        tareas.extend(llm.tareas)
    return _Extraccion(guardado, tuple(tareas))


def _fuentes_del_dorado(dorado: DoradoDePoblacion) -> list[Any]:
    por_documento: dict[str, list[ParDorado]] = defaultdict(list)
    for par in dorado.pares:
        por_documento[par.documento].append(par)
    return [
        (
            documento,
            dorado.documentos[documento].tipo_de_cancer,
            dorado.documentos[documento].fragmentos,
            {p.criterio: p.propuesta for p in pares},
            {p.criterio: p.corte for p in pares if p.corte},
        )
        for documento, pares in por_documento.items()
    ]


def _claves_de_estudio(config: ConfigPoblacion, tipos: Sequence[str]) -> dict[tuple[str, str], str]:
    """(tipo, clave del criterio) → ``studyKey`` donde la extracción guarda su lista."""
    criterios = cargar_criterios_de_aplicabilidad(config.catalogo, tuple(tipos))
    return {(t, c.clave): c.clave_de_estudio for t in tipos for c in criterios.criterios(t)}


def _valores_guardados(guardado: Mapping[str, Any], clave_de_estudio: str) -> tuple[str, ...]:
    lista = guardado.get(clave_de_estudio)
    if not isinstance(lista, list):  # la marca ``pendiente`` no guarda valores
        return ()
    return tuple(normalizar_texto(v["value"]) for v in lista)


def _pares_medidos(
    config: ConfigPoblacion, dorado: DoradoDePoblacion, extraccion: _Extraccion
) -> list[ParMedido]:
    tipos = sorted({d.tipo_de_cancer for d in dorado.documentos.values()})
    claves = _claves_de_estudio(config, tipos)
    medidos = []
    for par in dorado.pares:
        tipo = dorado.documentos[par.documento].tipo_de_cancer
        estudio = claves.get((tipo, par.criterio))
        if estudio is None:
            raise ConfigInvalida(
                f"el criterio {par.criterio} no está en el catálogo del tipo {tipo}"
            )
        medidos.append(
            ParMedido(
                par.documento,
                par.criterio,
                frozenset(normalizar_texto(v.valor) for v in par.esperados),
                _valores_guardados(extraccion.guardado[par.documento], estudio),
            )
        )
    return medidos


# --- estados -------------------------------------------------------------------------------------------------------


def _estados_calculados(dorado: DoradoDePoblacion) -> list[CasoDeEstado]:
    criterios = {
        tipo: cargar_criterios_de_aplicabilidad(dorado.catalogo_de_estados, (tipo,))
        for tipo in {c.tipo_de_cancer for c in dorado.estados}
    }
    return [
        _caso_de_estado(caso, criterios[caso.tipo_de_cancer].criterios(caso.tipo_de_cancer))
        for caso in dorado.estados
    ]


def _caso_de_estado(
    caso: CasoDeEstadoDorado, criterios: Sequence[CriterioDeAplicabilidad]
) -> CasoDeEstado:
    criterio = next((c for c in criterios if c.clave == caso.criterio), None)
    if criterio is None:
        raise ConfigInvalida(f"el caso {caso.id} cita un criterio que el catálogo no declara")
    valores = CriterioDePoblacion(
        tuple(ValorDePoblacion(v.valor, v.scope, v.chunk) for v in caso.valores)  # type: ignore[arg-type]
    )
    citados = (
        valores.valores if caso.citados is None else valores_de_la_opcion(valores, caso.citados)
    )
    calculado = estado_de_poblacion(citados, caso.paciente, criterio).estado
    return CasoDeEstado(caso.id, caso.esperado, calculado)


# --- bucle (OUT-06) ------------------------------------------------------------------------------------------------


def _pares_del_bucle_con_corte(config: ConfigPoblacion, bucle: Sequence[ParDelBucle]) -> int:
    """Pares cuya tarea corta terminó alguna vez con ``finish_reason = length``."""
    con_corte = 0
    for par in bucle:
        fuentes = [
            (f.documento, "mama", f.fragmentos, {}, {"estado_her2": f.corte} if f.corte else {})
            for f in par.fuentes
        ]
        extraccion = _extraer(config, fuentes)
        con_corte += bool(cortes_por_longitud(extraccion.tareas))
    return con_corte


# --- reporte -------------------------------------------------------------------------------------------------------


def _reporte(
    config: ConfigPoblacion,
    dorado: DoradoDePoblacion,
    medidor_sin_evidencia: Callable[[Path], MedicionSinEvidencia],
) -> tuple[dict[str, Any], list[tuple[str, str]]]:
    extraccion = _extraer(config, _fuentes_del_dorado(dorado))
    pares = _pares_medidos(config, dorado, extraccion)
    cortes = cortes_por_longitud(extraccion.tareas)
    concluyente = (
        dorado.revision.completa and len(dorado.pares) >= config.minimo_de_pares_del_dorado
    )
    por_criterio = _por_criterio(config, pares, concluyente)
    duplicados = _duplicados(config, pares)
    concordancia = _concordancia(config, dorado)
    sin_evidencia = _sin_evidencia(config, medidor_sin_evidencia)
    bucle = tasa_cortes_del_bucle(
        len(dorado.bucle),
        _pares_del_bucle_con_corte(config, dorado.bucle),
        config.minimo_de_pares_del_bucle,
    )
    resultado = veredicto(
        cortes=len(cortes),
        sin_evidencia_violada=sin_evidencia.violada,
        revisor_completo=dorado.revision.completa,
        pares_del_dorado=len(dorado.pares),
        minimo_de_pares=config.minimo_de_pares_del_dorado,
        marcas=_marcas(por_criterio, duplicados, concordancia),
    )
    estado = MARCA_NO_CONCLUYENTE if not concluyente else "concluyente"
    reporte = {
        "esquema": VERSION_ESQUEMA,
        "suite": SUITE_POBLACION,
        "configuracion": _configuracion(config, dorado),
        "metricas": {
            "pares_del_dorado": len(dorado.pares),
            "estratos": [{"estrato": k, "pares": n} for k, n in dorado.estratos().items()],
            "por_criterio": por_criterio,
            "tasa_duplicados": duplicados,
            "cortes_por_longitud": {
                "tareas": len(extraccion.tareas),
                "cortes": len(cortes),
                "casos": [{"documento": d, "criterio": c} for d, c in cortes],
            },
            "concordancia": concordancia,
            "sin_evidencia": {
                "baseline": sin_evidencia.baseline,
                "actual": sin_evidencia.actual,
                "baja": sin_evidencia.baja,
                "violaciones_rn02": sin_evidencia.violaciones_rn02,
            },
            "bucle": {
                "pares": bucle.pares,
                "cortes": bucle.cortes,
                "tasa": bucle.tasa,
                "minimo_de_pares": bucle.minimo_de_pares,
                "out06": bucle.out06,
            },
        },
        "veredicto": {
            "resultado": resultado.resultado,
            "precision": estado,
            "cobertura": estado,
            "causas": list(resultado.causas),
            "invariantes_violadas": list(resultado.invariantes_violadas),
        },
    }
    return reporte, cortes


def _configuracion(config: ConfigPoblacion, dorado: DoradoDePoblacion) -> dict[str, Any]:
    revision = dorado.revision
    return {
        "nombre": config.nombre,
        "hashConfig": config.hash_config,
        "fixture": config.fixture,
        "claseDataset": dorado.clase,
        "dataset": {"nombre": dorado.nombre, "version": dorado.version},
        "proveedor": config.proveedor,
        "reloj": config.reloj,
        "umbrales": {"nliEntailmentThreshold": config.umbral_nli},
        "revision": {
            "completa": revision.completa,
            **({"rol": revision.rol} if revision.rol else {}),
            **({"fecha": revision.fecha.isoformat()} if revision.fecha else {}),
        },
    }


def _por_criterio(
    config: ConfigPoblacion, pares: Sequence[ParMedido], concluyente: bool
) -> list[dict[str, Any]]:
    precision = precision_por_criterio(pares)
    cobertura = cobertura_por_criterio(pares)
    metas = config.metas
    return [
        {
            "criterio": criterio,
            "esperados": sum(len(p.esperados) for p in pares if p.criterio == criterio),
            "obtenidos": precision[criterio].total,
            "coincidentes": precision[criterio].aciertos,
            "precision": precision[criterio].valor,
            "cobertura": cobertura[criterio].valor,
            "meta_precision": metas.precision_minima,
            "meta_cobertura": metas.cobertura_minima,
            "marca_precision": _marca(precision[criterio], metas.precision_minima, concluyente),
            "marca_cobertura": _marca(cobertura[criterio], metas.cobertura_minima, concluyente),
        }
        for criterio in sorted(precision)
    ]


def _marca(fraccion: Fraccion, minimo: float, concluyente: bool) -> str:
    return marca_frente_a_meta(fraccion.valor, minimo) if concluyente else MARCA_NO_CONCLUYENTE


def _duplicados(config: ConfigPoblacion, pares: Sequence[ParMedido]) -> dict[str, Any]:
    fraccion = tasa_duplicados(pares)
    maximo = config.metas.duplicados_maximos
    valor = fraccion.valor
    marca = "no_medida" if valor is None else ("en_meta" if valor <= maximo else "fuera_de_meta")
    return {
        "obtenidos": fraccion.total,
        "duplicados": fraccion.aciertos,
        "valor": valor,
        "meta": maximo,
        "marca": marca,
    }


def _concordancia(config: ConfigPoblacion, dorado: DoradoDePoblacion) -> dict[str, Any]:
    resultado = concordancia_de_estados(_estados_calculados(dorado))
    minimo = config.metas.concordancia_minima
    return {
        "por_estado": {
            estado: {"esperados": f.total, "aciertos": f.aciertos}
            for estado, f in resultado.por_estado.items()
        },
        "aciertos": resultado.total.aciertos,
        "total": resultado.total.total,
        "valor": resultado.total.valor,
        "meta": minimo,
        "marca": marca_frente_a_meta(resultado.total.valor, minimo),
        "no_coincide_indebido": resultado.no_coincide_indebido,
        "coincide_indebido": resultado.coincide_indebido,
    }


def _sin_evidencia(config: ConfigPoblacion, medidor: Callable[[Path], MedicionSinEvidencia]) -> Any:
    medido = medidor(config.config_sin_evidencia)
    return sin_evidencia_vs_baseline(
        _exactitud_del_baseline(config.baseline), medido.exactitud, medido.violaciones_rn02
    )


def _exactitud_del_baseline(ruta: Path) -> float | None:
    try:
        baseline = json.loads(ruta.read_text(encoding="utf-8"))
        return baseline["metricas"]["completa"]["sin_evidencia"]["exactitud"]  # type: ignore[no-any-return]
    except (OSError, json.JSONDecodeError, KeyError, TypeError):
        raise ConfigInvalida("el baseline no trae la métrica sin_evidencia") from None


def _marcas(
    por_criterio: Sequence[Mapping[str, Any]],
    duplicados: Mapping[str, Any],
    concordancia: Mapping[str, Any],
) -> list[str]:
    marcas = [c["marca_precision"] for c in por_criterio] + [
        c["marca_cobertura"] for c in por_criterio
    ]
    return [*marcas, duplicados["marca"], concordancia["marca"]]


def _ruta_del_resultado(config: ConfigPoblacion, args: argparse.Namespace, reloj: Clock) -> Path:
    carpeta = args.salida or raiz_repo() / "apps" / "rag-orchestrator" / SALIDA_POR_DEFECTO
    return carpeta / (
        args.nombre_archivo
        or f"{reloj.ahora().date().isoformat()}-{config.hash_config}-{SUITE_POBLACION}.json"
    )


def _codigo_de_salida(reporte: dict[str, Any], cortes: Sequence[tuple[str, str]]) -> int:
    violadas = reporte["veredicto"]["invariantes_violadas"]
    if not violadas:
        return 0
    print(f"evaluate: invariante violada: {', '.join(violadas)}", file=sys.stderr)
    for documento, criterio in cortes:
        print(f"evaluate: finish_reason length en {documento} / {criterio}", file=sys.stderr)
    return CODIGO_INVARIANTE_VIOLADA
