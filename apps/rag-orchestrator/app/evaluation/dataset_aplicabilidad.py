"""Dataset sintético de la familia `aplicabilidad` (``data/evaluation/aplicabilidad/``, US-132, D2).

Pares paciente-fuente con el estado esperado por criterio. Solo lee archivos del dataset y los catálogos del manifiesto:
ningún acceso a bases de datos ni a datos clínicos. Un manifiesto sin ``clase: sintetico`` se rechaza antes de medir
(RN-14); una clave de población que el catálogo no resuelve es una configuración inválida. Los mensajes nombran el
archivo o la clave, nunca un valor de paciente ni de fuente.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from app.domain.corpus_seed.poblacion import NO_DISPONIBLE
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.evaluation.config_suite import ConfigInvalida, _ruta_del_repo
from app.evaluation.dataset_loader import CLASE_SINTETICA, DatasetInvalido
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.metricas.aplicabilidad import Esperado
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible
from app.schemas.generated.models import ClinicalContext

ETIQUETAS_NLI = ("entailment", "neutral")


@dataclass(frozen=True)
class ChunkDeFuenteDelDataset:
    chunk_id: str
    texto: str
    relevance_score: float


@dataclass(frozen=True)
class FuenteDelDataset:
    document_id: str
    external_id: str
    titulo: str
    tipo_de_cancer: str
    metadata_source: str
    population_criteria: Mapping[str, object]
    chunks: tuple[ChunkDeFuenteDelDataset, ...]


@dataclass(frozen=True)
class PropuestaGuionada:
    criterio: str
    valor: str
    chunk_id: str


@dataclass(frozen=True)
class Guion:
    """Lo que el LLM falso propone y lo que el NLI falso responde en un par."""

    propuestas: tuple[PropuestaGuionada, ...]
    nli: str


@dataclass(frozen=True)
class ParDelDataset:
    id: str
    paciente: str
    fuente: str
    guion: str
    esperados: Mapping[str, Esperado]


@dataclass(frozen=True)
class DatasetAplicabilidad:
    nombre: str
    version: str
    clase: str
    catalog_version: str
    catalogos: Mapping[str, Path]
    contextos: Mapping[str, ClinicalContext]
    fuentes: Mapping[str, FuenteDelDataset]
    guiones: Mapping[str, Guion]
    pares: tuple[ParDelDataset, ...]


class CriteriosPorTipo:
    """``CriteriosDeAplicabilidad`` con un directorio de catálogo por tipo de cáncer (``test-apl-1.0.0`` no declara
    criterios de próstata, así que ese grupo usa el catálogo real)."""

    def __init__(self, por_tipo: Mapping[str, tuple[CriterioDeAplicabilidad, ...]]) -> None:
        self._por_tipo = dict(por_tipo)

    def criterios(self, tipo_de_cancer: str) -> tuple[CriterioDeAplicabilidad, ...]:
        return self._por_tipo.get(tipo_de_cancer, ())


def cargar_dataset_aplicabilidad(directorio: Path) -> DatasetAplicabilidad:
    manifiesto = _leer_json(directorio / "manifest.json", "manifest.json")
    if manifiesto.get("clase") != CLASE_SINTETICA:
        raise SuiteAbortada("el manifest.json del dataset no declara clase: sintetico (RN-14)")
    try:
        pares = _leer_yaml(directorio / "pares.yaml", "pares.yaml")
        return DatasetAplicabilidad(
            nombre=str(manifiesto["nombre"]),
            version=str(manifiesto["version"]),
            clase=CLASE_SINTETICA,
            catalog_version=str(manifiesto["catalogVersion"]),
            catalogos={tipo: _ruta_del_repo(str(r)) for tipo, r in manifiesto["catalogos"].items()},
            contextos=_contextos(directorio / "contextos"),
            fuentes=_fuentes(directorio / "fuentes"),
            guiones={nombre: _guion(g) for nombre, g in pares["guiones"].items()},
            pares=tuple(_par(p) for p in pares["pares"]),
        )
    except (KeyError, TypeError, AttributeError, ValueError, ValidationError):
        raise DatasetInvalido("el dataset de aplicabilidad no tiene la forma esperada") from None


def cargar_criterios(dataset: DatasetAplicabilidad) -> CriteriosPorTipo:
    try:
        return CriteriosPorTipo(
            {
                tipo: cargar_criterios_de_aplicabilidad(ruta, (tipo,)).criterios(tipo)
                for tipo, ruta in dataset.catalogos.items()
            }
        )
    except CatalogoNoDisponible:
        raise SuiteAbortada("el catálogo de criterios del dataset no está disponible") from None


def exigir_claves_resolubles(dataset: DatasetAplicabilidad, criterios: CriteriosPorTipo) -> None:
    """Toda clave de población declarada por una fuente (distinta de ``no_disponible``) es el ``studyKey`` de un criterio
    del catálogo de su tipo; si el catálogo renombra la clave, la medición dejaría de medir esa fuente."""
    for fuente in dataset.fuentes.values():
        claves = {c.clave_de_estudio for c in criterios.criterios(fuente.tipo_de_cancer)}
        for clave in claves_declaradas(fuente.population_criteria):
            if clave not in claves:
                raise ConfigInvalida(
                    f"la clave de población {clave} de {fuente.document_id} no resuelve en el catálogo"
                )


def claves_declaradas(criterios: Mapping[str, object], prefijo: str = "") -> list[str]:
    """Claves ``studyKey`` con valor distinto de ``no_disponible``; un objeto con ``valor`` es una hoja (``alcance``)."""
    claves: list[str] = []
    for nombre, valor in criterios.items():
        clave = f"{prefijo}{nombre}"
        if isinstance(valor, dict) and "valor" not in valor:
            claves.extend(claves_declaradas(valor, f"{clave}."))
        elif valor != NO_DISPONIBLE:
            claves.append(clave)
    return claves


def _leer_json(ruta: Path, nombre: str) -> dict[str, Any]:
    try:
        contenido = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise DatasetInvalido(f"no se pudo leer {nombre} del dataset de aplicabilidad") from None
    if not isinstance(contenido, dict):
        raise DatasetInvalido(f"{nombre} del dataset de aplicabilidad no es un objeto")
    return contenido


def _leer_yaml(ruta: Path, nombre: str) -> dict[str, Any]:
    try:
        contenido = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise DatasetInvalido(f"no se pudo leer {nombre} del dataset de aplicabilidad") from None
    if not isinstance(contenido, dict):
        raise DatasetInvalido(f"{nombre} del dataset de aplicabilidad no es un mapa")
    return contenido


def _contextos(directorio: Path) -> dict[str, ClinicalContext]:
    return {
        archivo.stem: ClinicalContext.model_validate(_leer_json(archivo, archivo.name))
        for archivo in sorted(directorio.glob("*.json"))
    }


def _fuentes(directorio: Path) -> dict[str, FuenteDelDataset]:
    fuentes: dict[str, FuenteDelDataset] = {}
    for archivo in sorted(directorio.glob("*.json")):
        d = _leer_json(archivo, archivo.name)
        fuentes[d["document_id"]] = FuenteDelDataset(
            document_id=d["document_id"],
            external_id=d["external_id"],
            titulo=d["title"],
            tipo_de_cancer=d["tipo_de_cancer"],
            metadata_source=d["metadata_source"],
            population_criteria=d["population_criteria"],
            chunks=tuple(
                ChunkDeFuenteDelDataset(c["chunk_id"], c["text"], float(c["relevance_score"]))
                for c in d["chunks"]
            ),
        )
    return fuentes


def _guion(crudo: Mapping[str, Any]) -> Guion:
    nli = str(crudo["nli"])
    if nli not in ETIQUETAS_NLI:
        raise KeyError(nli)
    return Guion(
        tuple(
            PropuestaGuionada(p["criterio"], str(p["valor"]), p["chunk"])
            for p in crudo["propuestas"]
        ),
        nli,
    )


def _par(crudo: Mapping[str, Any]) -> ParDelDataset:
    return ParDelDataset(
        id=crudo["id"],
        paciente=crudo["paciente"],
        fuente=crudo["fuente"],
        guion=crudo["guion"],
        esperados={
            clave: Esperado(e["estado"], e.get("causa")) for clave, e in crudo["esperado"].items()
        },
    )
