"""Dataset ``chat-v1`` de la familia ``chat`` de ``evaluate`` (US-269, OL-06): carga y validación, sin E/S de modelos."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

INTENCIONES = ("caso", "faltantes", "evidencia", "fuentes_limitaciones")
TIPOS_DE_CANCER = ("mama", "prostata")
ACS = ("AC01", "AC02", "AC03", "AC04", "AC05", "AC06")
REVISIONES = ("pendiente", "aprobado")
MINIMO_DE_CASOS = 12


@dataclass(frozen=True)
class FaltanteSembrado:
    item: str
    gap_type: str


@dataclass(frozen=True)
class PacienteConFaltantes:
    paciente: str
    cancer: str
    items: tuple[FaltanteSembrado, ...]


@dataclass(frozen=True)
class EjemploDelCaso:
    """La petición de ``chat-fake.yaml``: un ejemplo de ``contracts/examples/`` y la traducción clave del seed → ``factRef``."""

    base: str
    hechos: Mapping[str, str]


@dataclass(frozen=True)
class GuionDelLlm:
    """La salida cruda del LLM falso: la intención que clasifica y las afirmaciones que propone."""

    ruta: str
    afirmaciones: tuple[Mapping[str, object], ...]


@dataclass(frozen=True)
class CasoDeChat:
    id: str
    ac: str
    cancer: str
    paciente: str
    intent: str
    pregunta: str
    respuesta_esperada: str
    hechos_esperados: tuple[str, ...]
    criterios_esperados: tuple[str, ...]
    revision_oncologo: str
    previo: str | None
    ejemplo: EjemploDelCaso
    guion: GuionDelLlm


@dataclass(frozen=True)
class ControlDeChat:
    """Un turno que solo cuenta en las salidas prescriptivas (RN-23): no entra en la cobertura ni en las métricas por tipo."""

    id: str
    control: str
    cancer: str
    pregunta: str
    ejemplo: EjemploDelCaso
    guion: GuionDelLlm


@dataclass(frozen=True)
class DatasetDeChat:
    nombre: str
    version: str
    clase: str
    corpus: Path
    casos: tuple[CasoDeChat, ...]
    controles: tuple[ControlDeChat, ...]
    faltantes_sembrados: tuple[PacienteConFaltantes, ...]


def cargar_dataset_de_chat(directorio: Path) -> DatasetDeChat:
    raise NotImplementedError("no implementado")
