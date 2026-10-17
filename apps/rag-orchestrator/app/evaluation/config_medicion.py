"""Carga tipada de ``eval/configs/adr39-fase-a.yaml`` y ``adr39-fase-a2.yaml`` (RN-22: nada de esto va en el código)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from app.evaluation.model_selection import Restricciones

# Commit exacto del repositorio cuyo código remoto se ejecuta al EXPORTAR (trust_remote_code). Vive aquí y no en
# eval/configs/adr39-fase-a.yaml porque ese archivo está congelado (decisión del 2026-10-20).
# Alibaba-NLP/new-impl: cabeza de main (última modificación 2024-08-11, anterior a la medición del 2026-10-16).
CODIGO_REMOTO_FIJADO = {
    "Alibaba-NLP/gte-multilingual-reranker-base": "40ced75c3017eb27626c9d4ea981bde21a2662f4"
}

TAREAS = ("embedding", "reranker_cls", "reranker_causal", "nli")


@dataclass(frozen=True)
class ModeloSpec:
    id: str
    componente: str  # embeddings | reranker | nli
    modelo: str
    revision: str
    tarea: str
    max_length: int
    pooling: str = ""
    plantilla_consulta: str = "{texto}"
    plantilla_documento: str = "{texto}"
    instruccion: str = ""
    sparse: str = ""
    dim_salida: int = 0
    atencion: str = "sdpa"
    codigo_remoto: bool = False
    code_revision: str = (
        ""  # commit exacto del repositorio del código remoto (obligatorio si codigo_remoto)
    )
    export_pythonpath: str = ""

    @property
    def clave(self) -> str:
        return f"{self.componente}-{self.id}"

    @property
    def directorio(self) -> str:
        return f"{self.modelo.replace('/', '__')}@{self.revision[:12]}"


@dataclass(frozen=True)
class ChunkingBase:
    estrategia: str
    tamano: int
    solapamiento_pct: float


@dataclass(frozen=True)
class ConfigMedicion:
    dataset: str
    semilla_bootstrap: int
    bootstrap_repeticiones: int
    corridas: int
    calentamiento: int
    hilos_cpu: int
    cuantizaciones: tuple[str, ...]
    tolerancia_empate: float
    restricciones: Restricciones
    chunking: ChunkingBase
    k: int
    reranker_max_pairs: int
    reranker_max_length: int
    consultas_por_corrida: int
    lotes_reranker_por_corrida: int
    tamano_lote_nli: int
    contexto_resumen: str
    candidatos: dict[str, tuple[ModeloSpec, ...]] = field(default_factory=dict)
    bruto: dict[str, Any] = field(default_factory=dict)


def spec_desde_yaml(componente: str, crudo: dict[str, Any]) -> ModeloSpec:
    """``ModeloSpec`` de un bloque de candidato; los bloques ``embedding`` de A2 y A3 omiten ``tarea`` (es ``embedding``)."""
    tarea = crudo.get("tarea", "embedding" if componente == "embeddings" else None)
    if tarea not in TAREAS:
        raise ValueError(f"tarea desconocida: {tarea}")
    code_revision = crudo.get("code_revision") or CODIGO_REMOTO_FIJADO.get(crudo["modelo"], "")
    if crudo.get("codigo_remoto") and not code_revision:
        raise ValueError(
            f"{crudo['modelo']}: codigo_remoto exige code_revision (commit exacto del código que se ejecuta)"
        )
    return ModeloSpec(
        id=str(crudo["id"]),
        componente=componente,
        modelo=crudo["modelo"],
        revision=crudo["revision"],
        tarea=tarea,
        max_length=int(crudo["max_length"]),
        pooling=crudo.get("pooling", ""),
        plantilla_consulta=crudo.get("plantilla_consulta", "{texto}"),
        plantilla_documento=crudo.get("plantilla_documento", "{texto}"),
        instruccion=crudo.get("instruccion", ""),
        sparse=crudo.get("sparse", ""),
        dim_salida=int(crudo.get("dim_salida", 0)),
        atencion=crudo.get("atencion", "sdpa"),
        codigo_remoto=bool(crudo.get("codigo_remoto", False)),
        code_revision=code_revision,
        export_pythonpath=crudo.get("export_pythonpath", ""),
    )


def cargar_config(ruta: Path) -> ConfigMedicion:
    crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    r = crudo["restricciones"]
    restricciones = Restricciones(
        stack_memory_limit_gb=float(r["stack_memory_limit_gb"]),
        llm_memory_budget_gb=float(r["llm_budget_gb"]),
        stage_p95_budget_ms={k: float(v) for k, v in r["stage_p95_budget_ms"].items()},
        academic_licenses=frozenset(r["academic_licenses"]),
    )
    protocolo = crudo["protocolo"]
    rec = crudo["recuperacion"]
    lat = crudo["latencia"]
    candidatos = {
        componente: tuple(spec_desde_yaml(componente, c) for c in crudo[componente])
        for componente in ("embeddings", "reranker", "nli")
        if componente in crudo
    }
    return ConfigMedicion(
        dataset=crudo["dataset"],
        semilla_bootstrap=int(crudo["semilla_bootstrap"]),
        bootstrap_repeticiones=int(crudo["bootstrap_repeticiones"]),
        corridas=int(protocolo["corridas"]),
        calentamiento=int(protocolo["calentamiento"]),
        hilos_cpu=int(protocolo["hilos_cpu"]),
        cuantizaciones=tuple(protocolo["cuantizaciones"]),
        tolerancia_empate=float(protocolo["tolerancia_empate"]),
        restricciones=restricciones,
        chunking=ChunkingBase(**rec["chunking"]),
        k=int(rec["k"]),
        reranker_max_pairs=int(rec["reranker_max_pairs"]),
        reranker_max_length=int(rec["reranker_max_length"]),
        consultas_por_corrida=int(lat["consultas_por_corrida"]),
        lotes_reranker_por_corrida=int(lat["lotes_reranker_por_corrida"]),
        tamano_lote_nli=int(lat["tamano_lote_nli"]),
        contexto_resumen=" ".join(str(lat["contexto_resumen"]).split()),
        candidatos=candidatos,
        bruto=crudo,
    )
