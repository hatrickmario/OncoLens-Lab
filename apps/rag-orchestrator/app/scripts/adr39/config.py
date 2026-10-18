"""Carga de ``eval/configs/adr39-fase-b.yaml``: protocolo, restricciones y candidatos (RN-22, sin constantes en código)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.evaluation.rutas import raiz_repo
from app.scripts.adr39.reglas import Restricciones

RUTA_CONFIG_POR_DEFECTO = (
    raiz_repo() / "apps" / "rag-orchestrator" / "eval" / "configs" / "adr39-fase-b.yaml"
)


class ConfigFaseBInvalida(ValueError):
    """Falta una sección o una clave del archivo de configuración."""


@dataclass(frozen=True)
class CandidatoLlm:
    id: str
    tag: str
    licencia: str
    licencia_verificada: bool


@dataclass(frozen=True)
class MotorOcr:
    id: str
    licencia: str
    escribe_a_disco: bool


@dataclass(frozen=True)
class ConfigFaseB:
    corridas: int
    llamadas_por_candidato: int
    consultas_por_corrida_e2e: int
    muestra_fidelidad: int
    repeticiones_admision: int
    restricciones: Restricciones
    runtimes: dict[str, dict[str, str]]
    llm: dict[str, Any]
    candidatos: tuple[CandidatoLlm, ...]
    e2e: dict[str, Any]
    ocr: dict[str, Any]
    motores_ocr: tuple[MotorOcr, ...]

    def candidato(self, id_candidato: str) -> CandidatoLlm:
        for c in self.candidatos:
            if c.id == id_candidato:
                return c
        raise KeyError(id_candidato)


def cargar_config(ruta: Path = RUTA_CONFIG_POR_DEFECTO) -> ConfigFaseB:
    crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    try:
        protocolo, rest = crudo["protocolo"], crudo["restricciones"]
        return ConfigFaseB(
            corridas=int(protocolo["corridas"]),
            llamadas_por_candidato=int(protocolo["llamadas_por_candidato"]),
            consultas_por_corrida_e2e=int(protocolo["consultas_por_corrida_e2e"]),
            muestra_fidelidad=int(protocolo["muestra_fidelidad"]),
            repeticiones_admision=int(protocolo["repeticiones_admision"]),
            restricciones=Restricciones(
                llm_memory_budget_gb=float(rest["llm_memory_budget_gb"]),
                stack_memory_limit_gb=float(rest["stack_memory_limit_gb"]),
                json_valido_minimo=float(rest["json_valido_minimo"]),
                e2e_p95_budget_ms=float(rest["e2e_p95_budget_ms"]),
                extraccion_p95_budget_ms=float(rest["extraccion_p95_budget_ms"]),
                fidelidad_minima=float(rest["fidelidad_minima"]),
                salidas_prescriptivas_maximas=int(rest["salidas_prescriptivas_maximas"]),
                salidas_otro_idioma_maximas=int(rest["salidas_otro_idioma_maximas"]),
                margen_de_seguridad_gb=float(rest["margen_de_seguridad_gb"]),
                licencias_academicas=frozenset(rest["licencias_academicas"]),
                licencias_condicionadas=frozenset(rest["licencias_condicionadas"]),
            ),
            runtimes={k: dict(v) for k, v in crudo["runtime"].items()},
            llm=dict(crudo["llm"]),
            candidatos=tuple(
                CandidatoLlm(
                    c["id"], c["tag"], c["licencia"], bool(c.get("licencia_verificada", True))
                )
                for c in crudo["llm"]["candidatos"]
            ),
            e2e=dict(crudo["e2e"]),
            ocr=dict(crudo["ocr"]),
            motores_ocr=tuple(
                MotorOcr(m["id"], m["licencia"], bool(m["escribe_a_disco"]))
                for m in crudo["ocr"]["motores"]
            ),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise ConfigFaseBInvalida(f"configuración de la fase B incompleta: {error!r}") from None
