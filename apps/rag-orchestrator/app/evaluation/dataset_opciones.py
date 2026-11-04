"""Dataset sintético de la familia `opciones` (``data/evaluation/opciones/``, US-140).

Se apoya en el cargador común de la suite (``FuenteDatasetEnDirectorio``: manifiesto, corpus, preguntas y propuestas del
generador falso, con el rechazo de un dataset no sintético) y añade ``casos.yaml``: la población de cada documento, el
paciente de cada pregunta y la verdad conocida (fuentes esperadas, orden de RN-28). Solo lee archivos del dataset y los
catálogos que declara su manifiesto; los mensajes nombran el archivo o el caso, nunca un texto.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.evaluation.config_suite import ruta_del_repo
from app.evaluation.dataset_loader import CLASE_SINTETICA, DatasetInvalido
from app.evaluation.fuente_dataset import DatasetSuite, FuenteDatasetEnDirectorio
from app.evaluation.guardas import SuiteAbortada
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible
from app.schemas.generated.models import ClinicalContext

CASOS_ESPERADOS = 12
CASOS_POR_TIPO = 6
CASOS_CON_NO_COMPARABLE = 2


@dataclass(frozen=True)
class PoblacionDeFuente:
    """``metadata_source`` y ``population_criteria`` de un documento tal como los guarda el catálogo del corpus."""

    document_id: str
    metadata_source: str
    population_criteria: Mapping[str, object]


@dataclass(frozen=True)
class CasoDeOpciones:
    id: str
    paciente: str
    esperadas: tuple[str, ...]
    """Documentos cuyas fuentes debe citar alguna opción mostrada (informativa: el LLM real puede describir otras)."""
    orden_esperado: tuple[str, ...]
    """El orden de RN-28 por fuente que fija un humano; solo comprueba la coherencia del dataset con las fakes."""
    no_comparable_mostrada: bool
    """El caso trae una opción de fuente única no comparable que debe mostrarse (US-140 AC-3)."""


@dataclass(frozen=True)
class DatasetOpciones:
    base: DatasetSuite
    catalog_version: str
    catalogos: Mapping[str, Path]
    contextos: Mapping[str, dict[str, Any]]
    """Los ``clinicalContext`` de los pacientes de test, ya validados contra el contrato (desidentificados)."""
    poblaciones: Mapping[str, PoblacionDeFuente]
    casos: tuple[CasoDeOpciones, ...]

    def caso_de(self, pregunta_id: str) -> CasoDeOpciones:
        return next(c for c in self.casos if c.id == pregunta_id)


class CriteriosPorTipo:
    """``CriteriosDeAplicabilidad`` con un directorio de catálogo por tipo de cáncer (el manifiesto del dataset)."""

    def __init__(self, por_tipo: Mapping[str, tuple[CriterioDeAplicabilidad, ...]]) -> None:
        self._por_tipo = dict(por_tipo)

    def criterios(self, tipo_de_cancer: str) -> tuple[CriterioDeAplicabilidad, ...]:
        return self._por_tipo.get(tipo_de_cancer, ())


def cargar_dataset_opciones(directorio: Path) -> DatasetOpciones:
    """Se niega (``DatasetInvalido``) si el manifiesto no declara ``clase: sintetico`` o la estructura no es válida."""
    base = FuenteDatasetEnDirectorio(directorio).cargar()
    if (
        base.clase != CLASE_SINTETICA
    ):  # RN-14: la familia solo mide sobre datos sintéticos, también fuera del repo
        raise DatasetInvalido("el manifiesto del dataset de opciones no declara clase: sintetico")
    manifiesto = _leer_yaml(directorio / "manifest.yaml", "manifest.yaml")
    casos_crudos = _leer_yaml(directorio / str(manifiesto["archivos"]["casos"]), "casos.yaml")
    if casos_crudos.get("clase") != CLASE_SINTETICA:
        raise DatasetInvalido("casos.yaml no declara la misma clase que el manifiesto")
    try:
        dataset = DatasetOpciones(
            base=base,
            catalog_version=str(manifiesto["catalogVersion"]),
            catalogos={tipo: ruta_del_repo(str(r)) for tipo, r in manifiesto["catalogos"].items()},
            contextos=_contextos(directorio / "contextos"),
            poblaciones={
                documento: PoblacionDeFuente(
                    documento, str(f["metadata_source"]), f["population_criteria"]
                )
                for documento, f in casos_crudos["fuentes"].items()
            },
            casos=tuple(_caso(caso, c) for caso, c in casos_crudos["casos"].items()),
        )
    except (KeyError, TypeError, AttributeError, ValueError, ValidationError):
        raise DatasetInvalido("el dataset de opciones no tiene la forma esperada") from None
    _exigir_coherencia(dataset)
    _exigir_revisiones_con_rol_y_fecha(directorio / str(manifiesto["archivos"]["preguntas"]))
    return dataset


def cargar_criterios(dataset: DatasetOpciones) -> CriteriosPorTipo:
    try:
        return CriteriosPorTipo(
            {
                tipo: cargar_criterios_de_aplicabilidad(ruta, (tipo,)).criterios(tipo)
                for tipo, ruta in dataset.catalogos.items()
            }
        )
    except CatalogoNoDisponible:
        raise SuiteAbortada("el catálogo de criterios del dataset no está disponible") from None


def _exigir_coherencia(dataset: DatasetOpciones) -> None:
    """Cada pregunta tiene su caso y su paciente; cada documento del corpus, su población."""
    preguntas = {p.id for p in dataset.base.preguntas}
    if preguntas != {c.id for c in dataset.casos}:
        raise DatasetInvalido("las preguntas y los casos del dataset de opciones no coinciden")
    if any(c.paciente not in dataset.contextos for c in dataset.casos):
        raise DatasetInvalido("un caso del dataset de opciones nombra un paciente que no existe")
    if {d.id for d in dataset.base.documentos} != set(dataset.poblaciones):
        raise DatasetInvalido(
            "los documentos y las poblaciones del dataset de opciones no coinciden"
        )


def _exigir_revisiones_con_rol_y_fecha(ruta: Path) -> None:
    """``revisada_por_oncologo`` es ``null`` (sin revisar) o ``{rol, fecha}`` sin nombre de persona (RN-10): un booleano o una
    revisión sin rol o sin fecha fabricaría una validación humana sin saber quién la hizo ni cuándo."""
    for pregunta in _leer_yaml(ruta, "preguntas.yaml")["preguntas"]:
        revision = pregunta.get("revisada_por_oncologo")
        if revision is None:
            continue
        if not _es_revision_con_rol_y_fecha(revision):
            raise DatasetInvalido(
                "revisada_por_oncologo debe ser null o {rol, fecha} sin nombre (RN-10)"
            )


def _es_revision_con_rol_y_fecha(revision: object) -> bool:
    """Exactamente ``rol`` (texto) y ``fecha`` (texto o fecha YAML): ninguna otra clave, ninguna vacía."""
    return (
        isinstance(revision, dict)
        and set(revision) == {"rol", "fecha"}
        and isinstance(revision["rol"], str)
        and bool(revision["rol"].strip())
        and bool(revision["fecha"])
    )


def _caso(identificador: str, crudo: Mapping[str, Any]) -> CasoDeOpciones:
    return CasoDeOpciones(
        id=str(identificador),
        paciente=str(crudo["paciente"]),
        esperadas=tuple(str(d) for d in crudo["esperadas"]),
        orden_esperado=tuple(str(d) for d in crudo["orden_esperado"]),
        no_comparable_mostrada=bool(crudo.get("no_comparable_mostrada", False)),
    )


def _contextos(directorio: Path) -> dict[str, dict[str, Any]]:
    contextos: dict[str, dict[str, Any]] = {}
    for archivo in sorted(directorio.glob("*.json")):
        try:
            crudo = json.loads(archivo.read_text(encoding="utf-8"))
            ClinicalContext.model_validate(crudo)
            contextos[archivo.stem] = crudo
        except (OSError, ValueError):
            raise DatasetInvalido(
                f"no se pudo leer {archivo.name} del dataset de opciones"
            ) from None
    return contextos


def _leer_yaml(ruta: Path, nombre: str) -> dict[str, Any]:
    try:
        contenido = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise DatasetInvalido(f"no se pudo leer {nombre} del dataset de opciones") from None
    if not isinstance(contenido, dict):
        raise DatasetInvalido(f"{nombre} del dataset de opciones no es un mapa")
    return contenido
