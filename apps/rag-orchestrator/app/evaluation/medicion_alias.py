"""Medición AC-7 de US-236 (L1D-287): LLM real local sobre el dataset vigente y la pregunta del origen x N.

Los parámetros salen de ``eval/configs/us236-alias.yaml`` (RN-22), no de literales. Desde ``apps/rag-orchestrator``, con
Ollama en localhost:

    python -m app.evaluation.medicion_alias [--config eval/configs/us236-alias.yaml] [--salida RUTA] [--max-preguntas N]

La salida por defecto es ``eval/results/us236-<prompt>.json`` (ignorada por git). Usa el ``LlmEvidenceGenerator`` real
y ``validar_citas``; solo corpus público y datos sintéticos; el LLM es el local (RN-12). Mide tres conjuntos:
``origen`` (la pregunta de la demo sobre el inicio de ``pmc-mama-cdk46-guia``), ``origen_ruido`` (la misma pregunta con
un chunk sintético con LaTeX y ruido; el chunk real de la demo no se versiona) y ``dataset`` (preguntas con evidencia).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from app.application.generation import LlmEvidenceGenerator
from app.bootstrap import crear_generador_local
from app.config.settings import Settings
from app.domain.citations import validar_citas
from app.domain.relevance import ChunkPuntuado
from app.evaluation.config_suite import ConfigInvalida, ConfigSuite, cargar_config_suite
from app.evaluation.corrida import citas_propuestas_de, solicitud_base
from app.evaluation.dataset_loader import cargar_dataset_configurado
from app.evaluation.rutas import raiz_repo
from app.prompts.rag_query import VERSION_DEL_PROMPT
from app.schemas.generated.models import RagQueryInternalRequest

CONFIG_POR_DEFECTO = Path("eval/configs/us236-alias.yaml")
DOCUMENTO_DEL_ORIGEN = "pmc-mama-cdk46-guia"
ID_DEL_ORIGEN = (
    f"{DOCUMENTO_DEL_ORIGEN}@a3bb26468a32#0000"  # largo y con hash, como en la demo del 2026-10-23
)
CARACTERES_DEL_ORIGEN = 1800
RUIDO = [r"$\mathrm{CDK4/6i}$", r"\(\geq\)", r"$\textit{n}=5101$", r"\%", r"$^{\dagger}$"]


@dataclass(frozen=True)
class ParametrosDeMedicion:
    modelo: str
    url_llm: str
    pregunta_origen: str
    corridas_origen: int
    dataset: Path


def parametros_de(config: ConfigSuite) -> ParametrosDeMedicion:
    """Los parámetros de la medición salen de la configuración cargada; falta algo → ``ConfigInvalida`` sin valores."""
    origen = config.origen or {}
    url = config.urls.get("llm")
    if not url or "pregunta" not in origen or "EVAL_ORIGIN_RUNS" not in origen:
        raise ConfigInvalida(
            "la medición exige urls.llm, origen.pregunta y origen.EVAL_ORIGIN_RUNS"
        )
    return ParametrosDeMedicion(
        modelo=config.llm_modelo,
        url_llm=url,
        pregunta_origen=str(origen["pregunta"]),
        corridas_origen=int(origen["EVAL_ORIGIN_RUNS"]),
        dataset=config.dataset,
    )


def con_ruido(texto: str) -> str:
    """Intercala LaTeX y símbolos en el texto (sintético): imita la transcripción ruidosa del chunk de la demo."""
    palabras = texto.split()
    for i in range(7, len(palabras), 25):
        palabras.insert(i, RUIDO[(i // 25) % len(RUIDO)])
    return " ".join(palabras)


def _solicitud_de(pregunta: str) -> RagQueryInternalRequest:
    cruda: dict[str, Any] = solicitud_base()
    cruda["query"] = pregunta
    return RagQueryInternalRequest.model_validate(cruda)


async def medir(
    generador: LlmEvidenceGenerator, pregunta: str, idioma: str, chunks: list[ChunkPuntuado]
) -> dict[str, Any]:
    recuperacion = SimpleNamespace(
        chunks_sobre_umbral=tuple(chunks), meta=SimpleNamespace(responseLanguage=idioma)
    )
    inicio = time.perf_counter()
    try:
        evidencia = await generador.generar(_solicitud_de(pregunta), recuperacion)  # type: ignore[arg-type]
    except Exception as error:  # noqa: BLE001 - la medición registra la clase del fallo, nunca su mensaje
        return {"error": type(error).__name__, "s": round(time.perf_counter() - inicio, 1)}
    ids = {c.chunk_id for c in chunks}
    resultado = validar_citas(evidencia.opciones, ids)
    return {
        "opciones": len(evidencia.opciones),
        "aceptadas": len(resultado.aceptadas),
        "cita_invalida": sum(d.motivo.value == "cita_invalida" for d in resultado.descartadas),
        "sin_citas": sum(d.motivo.value == "sin_citas" for d in resultado.descartadas),
        "citas": citas_propuestas_de(evidencia.opciones),
        "citas_validas": sum(len(a.chunk_ids_validos) for a in resultado.aceptadas),
        "s": round(time.perf_counter() - inicio, 1),
    }


def generador_de(params: ParametrosDeMedicion) -> LlmEvidenceGenerator:
    """El generador de producción (``crear_generador_local``): hereda de ``Settings`` todo salvo URL y modelo."""
    return crear_generador_local(Settings(llm_base_url=params.url_llm, llm_model=params.modelo))


async def correr(
    generador: LlmEvidenceGenerator, params: ParametrosDeMedicion, salida: Path, max_preguntas: int
) -> None:
    raiz = raiz_repo()
    ruta_texto = raiz / "data/raw/seed/docs" / f"{DOCUMENTO_DEL_ORIGEN}.txt"
    texto = ruta_texto.read_text(encoding="utf-8")[:CARACTERES_DEL_ORIGEN]
    reporte: dict[str, Any] = {
        "prompt": VERSION_DEL_PROMPT,
        "modelo": params.modelo,
        "origen": [],
        "origen_ruido": [],
        "dataset": [],
    }
    salida.parent.mkdir(parents=True, exist_ok=True)

    def guardar() -> None:
        salida.write_text(json.dumps(reporte, ensure_ascii=False, indent=1), encoding="utf-8")

    for clave, contenido in (("origen", texto), ("origen_ruido", con_ruido(texto))):
        chunk = ChunkPuntuado(ID_DEL_ORIGEN, DOCUMENTO_DEL_ORIGEN, contenido, 0.9)
        for _ in range(params.corridas_origen):
            reporte[clave].append(await medir(generador, params.pregunta_origen, "es", [chunk]))
            guardar()
    dataset = cargar_dataset_configurado(params.dataset)
    preguntas = [p for p in dataset.preguntas if p.modo_acierto != "sin_evidencia" and p.evidencia]
    for p in preguntas[:max_preguntas]:
        chunks = [
            ChunkPuntuado(f"{e.documento}-{n}", e.documento, e.cita, 1.0 - n / 100)
            for n, e in enumerate(p.evidencia, start=1)
        ]
        reporte["dataset"].append({"id": p.id, **await medir(generador, p.texto, p.idioma, chunks)})
        guardar()


def main(argv: list[str] | None = None) -> int:
    analizador = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    analizador.add_argument("--config", type=Path, default=CONFIG_POR_DEFECTO)
    analizador.add_argument("--salida", type=Path, default=None)
    analizador.add_argument("--max-preguntas", type=int, default=1000)
    args = analizador.parse_args(argv)
    params = parametros_de(cargar_config_suite(args.config))
    salida = args.salida or Path("eval/results") / f"us236-{VERSION_DEL_PROMPT}.json"
    asyncio.run(correr(generador_de(params), params, salida, args.max_preguntas))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
