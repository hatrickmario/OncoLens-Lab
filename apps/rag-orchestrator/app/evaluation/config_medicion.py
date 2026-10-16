"""Carga tipada de ``eval/configs/adr39-fase-a.yaml`` y ``adr39-fase-a2.yaml`` (RN-22: nada de esto va en el código)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from app.evaluation.model_selection import Restricciones

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


def _spec(componente: str, crudo: dict[str, Any]) -> ModeloSpec:
    if crudo["tarea"] not in TAREAS:
        raise ValueError(f"tarea desconocida: {crudo['tarea']}")
    return ModeloSpec(
        id=str(crudo["id"]),
        componente=componente,
        modelo=crudo["modelo"],
        revision=crudo["revision"],
        tarea=crudo["tarea"],
        max_length=int(crudo["max_length"]),
        pooling=crudo.get("pooling", ""),
        plantilla_consulta=crudo.get("plantilla_consulta", "{texto}"),
        plantilla_documento=crudo.get("plantilla_documento", "{texto}"),
        instruccion=crudo.get("instruccion", ""),
        sparse=crudo.get("sparse", ""),
        dim_salida=int(crudo.get("dim_salida", 0)),
        atencion=crudo.get("atencion", "sdpa"),
        codigo_remoto=bool(crudo.get("codigo_remoto", False)),
        export_pythonpath=crudo.get("export_pythonpath", ""),
    )


def cargar_config(ruta: Path) -> ConfigMedicion:
    crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    r = crudo["restricciones"]
    restricciones = Restricciones(
        stack_memory_limit_gb=float(r["stack_memory_limit_gb"]),
        llm_budget_gb=float(r["llm_budget_gb"]),
        stage_p95_budget_ms={k: float(v) for k, v in r["stage_p95_budget_ms"].items()},
        academic_licenses=frozenset(r["academic_licenses"]),
    )
    protocolo = crudo["protocolo"]
    rec = crudo["recuperacion"]
    lat = crudo["latencia"]
    candidatos = {
        componente: tuple(_spec(componente, c) for c in crudo[componente])
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
