"""Evaluación del seguimiento de un análisis (US-218, OL-06): 4 casos sintéticos sobre el pipeline de PRODUCCIÓN.

``python -m app.evaluation.seguimiento --config <ruta> [--dataset <dir>] [--salida <dir>]``. Compone el
``RAGOrchestratorService`` con los adapters de la suite (``componer_servicio``) y le pone encima el MISMO
``ResponderSeguimiento`` y ``LlmSeguimientoGenerator`` de producción; solo el cliente del LLM es un guion del dataset.
Mide fidelidad, precisión de citas, «sin evidencia» (RN-02), salidas prescriptivas (RN-23) y que la memoria del análisis
nunca sea soporte (RN-24). Solo datos sintéticos (RN-14); el reporte lleva agregados, nunca texto.
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import json
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.application.generacion_de_seguimiento import LlmSeguimientoGenerator
from app.application.ports import FalloDelLlm
from app.application.seguimiento import ResponderSeguimiento
from app.domain.atribucion import (
    CLAIM_MAX_WORDS_INICIAL,
    CLAIMS_MAX_INICIAL,
    CLAIMS_MIN_INICIAL,
    marco_de_atribucion,
)
from app.domain.nli import ParNli
from app.evaluation.adaptadores_falsos import NliLexico
from app.evaluation.composicion_suite import componer_servicio
from app.evaluation.config_suite import ConfigSuite, cargar_config_suite
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.dataset_loader import CLASE_SINTETICA, DatasetInvalido
from app.evaluation.fuente_dataset import DatasetSuite, FuenteDatasetEnDirectorio
from app.evaluation.rutas import raiz_repo
from app.infrastructure.catalogo_clinico.sinonimos import cargar_terminos_por_tipo
from app.infrastructure.clock.system_clock import RelojDelSistema
from app.schemas.generated.models import RagFollowUpRequest, RagFollowUpResponse

DATASET_POR_DEFECTO = Path("data/eval/fx-seguimiento")
EJEMPLO_DE_SOLICITUD = Path("contracts/examples/rag-follow-up-request.json")


@dataclass(frozen=True)
class CasoDeSeguimiento:
    id: str
    pregunta: str
    guion: str
    estado: str
    mostradas: int
    omitidas: int


class ClienteGuionado:
    """``LlmClient`` del dataset: responde el guion de la pregunta (se identifica por su texto en el prompt) y cuenta."""

    def __init__(self, guiones: Mapping[str, str]) -> None:
        self._guiones = dict(guiones)
        self.invocaciones = 0

    async def completar_json(self, prompt: str, esquema: Mapping[str, Any]) -> str:
        self.invocaciones += 1
        for pregunta, guion in self._guiones.items():
            if f"Pregunta: {pregunta}\n" in prompt:
                return guion
        raise FalloDelLlm("sin guion para la pregunta")


def cargar_casos(directorio: Path) -> tuple[DatasetSuite, tuple[CasoDeSeguimiento, ...]]:
    """El dataset (clase ``sintetico``, RN-14) con el corpus de FX-T5a-a y los casos del seguimiento."""
    manifiesto = _leer(directorio / "manifest.yaml")
    crudo = _leer(directorio / manifiesto["archivos"]["casos"])
    if manifiesto.get("clase") != CLASE_SINTETICA or crudo.get("clase") != CLASE_SINTETICA:
        raise DatasetInvalido("el dataset del seguimiento debe declarar clase: sintetico")
    corpus = FuenteDatasetEnDirectorio(raiz_repo() / "data" / "eval" / crudo["corpus"]).cargar()
    casos = tuple(
        CasoDeSeguimiento(
            c["id"],
            c["pregunta"],
            json.dumps(c["guion"], ensure_ascii=False),
            c["esperado"]["estado"],
            c["esperado"]["mostradas"],
            c["esperado"]["omitidas"],
        )
        for c in crudo["casos"]
    )
    return corpus, casos


def _leer(ruta: Path) -> dict[str, Any]:
    try:
        return yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise DatasetInvalido("el dataset del seguimiento no se pudo leer") from None


def _solicitud(pregunta: str, config: ConfigSuite) -> RagFollowUpRequest:
    ejemplo = json.loads((raiz_repo() / EJEMPLO_DE_SOLICITUD).read_text(encoding="utf-8"))
    solicitud = copy.deepcopy(ejemplo)
    solicitud["question"] = pregunta
    solicitud["catalogVersion"] = config.catalogo_version
    return RagFollowUpRequest.model_validate(solicitud)


def _frases_de_la_memoria(solicitud: RagFollowUpRequest) -> list[str]:
    return [
        texto
        for m in solicitud.analysisMemory
        for texto in (
            m.question.root,
            m.synthesisSummary.root,
            *(o.root for o in m.optionsDescribed),
        )
    ]


async def evaluar(
    config: ConfigSuite, dataset: DatasetSuite, casos: Sequence[CasoDeSeguimiento]
) -> dict[str, Any]:
    cliente = ClienteGuionado({c.pregunta: c.guion for c in casos})
    suite = componer_servicio(config, dataset, Cronometro(RelojSimulado()), RelojDelSistema())
    responder = ResponderSeguimiento(
        servicio=suite.servicio,
        generador=LlmSeguimientoGenerator(
            cliente,
            claims_min=CLAIMS_MIN_INICIAL,
            claims_max=CLAIMS_MAX_INICIAL,
            claim_max_words=CLAIM_MAX_WORDS_INICIAL,
        ),
        terminos_por_tipo=cargar_terminos_por_tipo(config.ruta_terminos, ("mama", "prostata")),
    )
    juez = NliLexico()
    textos = {c.id: c.texto for c in dataset.chunks}
    titulos = {d.id: d.titulo for d in dataset.documentos}
    chunk_a_documento = {c.id: c.documento for c in dataset.chunks}
    contadores = dict(
        mostradas=0, fieles=0, citas=0, citas_correctas=0, prescriptivas=0, memoria_como_soporte=0
    )
    estados_correctos = sin_evidencia = sin_evidencia_ok = 0
    por_caso: list[dict[str, Any]] = []
    for caso in casos:
        solicitud = _solicitud(caso.pregunta, config)
        antes = cliente.invocaciones
        respuesta = await responder.responder(solicitud)
        llamadas_al_llm = cliente.invocaciones - antes
        memoria = _frases_de_la_memoria(solicitud)
        mostradas = _contar_mostradas(
            respuesta, juez, textos, titulos, chunk_a_documento, memoria, suite, contadores
        )
        ok = (
            respuesta.status.value == caso.estado
            and mostradas == caso.mostradas
            and respuesta.omittedClaims == caso.omitidas
        )
        estados_correctos += ok
        if caso.estado == "sin_evidencia":
            sin_evidencia += 1
            sin_evidencia_ok += (
                respuesta.status.value == "sin_evidencia"
                and respuesta.topRelevanceScore is None
                and llamadas_al_llm == 0
            )
        por_caso.append({"id": caso.id, "estado": respuesta.status.value, "correcto": ok})
    return _reporte(
        config, len(casos), estados_correctos, sin_evidencia, sin_evidencia_ok, contadores, por_caso
    )


def _contar_mostradas(
    respuesta: RagFollowUpResponse,
    juez: NliLexico,
    textos: Mapping[str, str],
    titulos: Mapping[str, str],
    chunk_a_documento: Mapping[str, str],
    memoria: Sequence[str],
    suite: Any,
    contadores: dict[str, int],
) -> int:
    marco = marco_de_atribucion("es")
    for afirmacion in respuesta.answer:
        cuerpo = afirmacion.root
        texto = cuerpo.text.removeprefix(marco)
        contadores["mostradas"] += 1
        premisas = [textos[c.chunkId] for c in cuerpo.citedSources if c.chunkId in textos]
        veredictos = juez.clasificar([ParNli(p, texto) for p in premisas])
        contadores["fieles"] += any(v.label == "entailment" for v in veredictos)
        for cita in cuerpo.citedSources:
            contadores["citas"] += 1
            documento = chunk_a_documento.get(cita.chunkId)
            contadores["citas_correctas"] += (
                documento is not None and cita.title == titulos[documento]
            )
        contadores["prescriptivas"] += bool(
            suite.verificador_estricto.coincidencias_mostradas(cuerpo.text, "rationale")
        )
        # RN-24: lo mostrado nunca es la memoria (ni se sostiene solo en ella).
        contadores["memoria_como_soporte"] += (
            any(frase in texto for frase in memoria) or not premisas
        )
    return len(respuesta.answer)


def _razon(parte: int, total: int) -> float | None:
    return None if total == 0 else parte / total  # sin muestra: None, nunca 0.0


def _reporte(
    config: ConfigSuite,
    casos: int,
    estados_correctos: int,
    sin_evidencia: int,
    sin_evidencia_ok: int,
    c: Mapping[str, int],
    por_caso: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "suite": "seguimiento",
        "config": config.nombre,
        "casos": casos,
        "metricas": {
            "estados_correctos": _razon(estados_correctos, casos),
            "fidelidad": _razon(c["fieles"], c["mostradas"]),
            "precision_de_citas": _razon(c["citas_correctas"], c["citas"]),
            "sin_evidencia": _razon(sin_evidencia_ok, sin_evidencia),
            "salidas_prescriptivas": c["prescriptivas"],
            "memoria_como_soporte": c["memoria_como_soporte"],
        },
        "por_caso": por_caso,
    }


def main(argv: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(prog="evaluar-seguimiento")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--dataset", type=Path, default=raiz_repo() / DATASET_POR_DEFECTO)
    parser.add_argument("--salida", type=Path, default=None)
    args = parser.parse_args(list(argv))
    dataset, casos = cargar_casos(args.dataset)
    reporte = asyncio.run(evaluar(cargar_config_suite(args.config), dataset, casos))
    texto = json.dumps(reporte, ensure_ascii=False, indent=2, sort_keys=True)
    if args.salida is not None:
        args.salida.mkdir(parents=True, exist_ok=True)
        (args.salida / "seguimiento.json").write_text(texto + "\n", encoding="utf-8")
    print(texto)
    metricas = reporte["metricas"]
    fallo = metricas["salidas_prescriptivas"] or metricas["memoria_como_soporte"]
    return 1 if fallo or metricas["estados_correctos"] != 1.0 else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
