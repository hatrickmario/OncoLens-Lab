"""Dataset sintético de la familia `contextual` (``data/eval/s5-corpus-ampliado/``, US-271 AC-9) y los casos del fixture.

El manifiesto del corpus declara la clase y, en ``archivos.preguntas_contextuales``, las 60 preguntas de la medición de
ADR-52 (22 genéricas, 24 con tema fuera del corpus y 14 controles). Los casos son los del fixture compartido
``temas-del-caso.json``: ``clinicalContext`` ya desidentificado. Los mensajes nombran el archivo, el id de la pregunta o el
del caso, nunca un texto (RN-14).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.evaluation.dataset_loader import DatasetInvalido, exigir_clase_sintetica
from app.evaluation.fuente_dataset import DatasetSuite, FuenteDatasetEnDirectorio
from app.evaluation.metricas.contextual import CLASES_DE_PREGUNTA
from app.evaluation.reporte import es_identificador
from app.evaluation.rutas import raiz_repo

FAMILIA = "contextual"
ARCHIVO_DE_PREGUNTAS = "preguntas_contextuales"


@dataclass(frozen=True)
class PreguntaContextual:
    id: str
    clase: str
    idioma: str
    texto: str
    """Solo vive en memoria: el informe nombra la pregunta por su id."""


@dataclass(frozen=True)
class DatasetContextual:
    nombre: str
    version: str
    ruta: str
    """Ruta del dataset relativa al repositorio (o el nombre de su carpeta si está fuera de él): nunca una ruta absoluta."""
    corpus: DatasetSuite
    preguntas: tuple[PreguntaContextual, ...]


@dataclass(frozen=True)
class CasoSintetico:
    id: str
    contexto_clinico: dict[str, Any]
    """``clinicalContext`` desidentificado del fixture: ``diagnosis`` y ``biomarkers``."""

    @property
    def tipo_de_cancer(self) -> str:
        return str(self.contexto_clinico["diagnosis"]["cancerType"])


def cargar_dataset_contextual(directorio: Path) -> DatasetContextual:
    """Se niega (``DatasetInvalido``) si el manifiesto o alguno de sus archivos no declara ``clase: sintetico`` (RN-13, RN-14),
    si falta el archivo de preguntas o si una pregunta no es válida."""
    manifiesto = _leer(directorio / "manifest.yaml", "manifest.yaml")
    exigir_clase_sintetica(manifiesto.get("clase"), "manifest.yaml", FAMILIA)
    declarado = manifiesto.get("archivos", {}).get(ARCHIVO_DE_PREGUNTAS)
    if not isinstance(declarado, str):
        raise DatasetInvalido(f"el manifiesto no declara archivos.{ARCHIVO_DE_PREGUNTAS}")
    crudo = _leer(directorio / declarado, declarado)
    exigir_clase_sintetica(crudo.get("clase"), declarado, FAMILIA)
    corpus = FuenteDatasetEnDirectorio(directorio).cargar()
    exigir_clase_sintetica(corpus.clase, "el corpus", FAMILIA)
    return DatasetContextual(
        corpus.nombre,
        corpus.version,
        _ruta_del_informe(directorio),
        corpus,
        _preguntas(crudo),
    )


def cargar_casos(ruta: Path, ids: tuple[str, ...]) -> tuple[CasoSintetico, ...]:
    """Los casos pedidos del fixture, en el orden pedido; un id que no está falla nombrándolo (``DatasetInvalido``)."""
    crudo = _leer_json(ruta)
    por_id = {str(c["id"]): c for c in crudo.get("casos", [])}
    faltantes = [i for i in ids if i not in por_id]
    if faltantes:
        raise DatasetInvalido(f"el fixture de casos no tiene el caso {faltantes[0]}")
    try:
        return tuple(CasoSintetico(i, dict(por_id[i]["clinicalContext"])) for i in ids)
    except (KeyError, TypeError):
        raise DatasetInvalido("un caso del fixture no trae clinicalContext") from None


def _preguntas(crudo: dict[str, Any]) -> tuple[PreguntaContextual, ...]:
    try:
        preguntas = tuple(
            PreguntaContextual(str(p["id"]), str(p["clase"]), str(p["idioma"]), str(p["pregunta"]))
            for p in crudo["preguntas"]
        )
    except (KeyError, TypeError):
        raise DatasetInvalido(
            "el archivo de preguntas contextuales no tiene la forma esperada"
        ) from None
    if not preguntas:
        raise DatasetInvalido("el dataset no tiene preguntas contextuales")
    if len({p.id for p in preguntas}) != len(preguntas):
        raise DatasetInvalido("las preguntas contextuales repiten un id")
    for p in preguntas:
        if not es_identificador(p.id) or p.clase not in CLASES_DE_PREGUNTA:
            raise DatasetInvalido("una pregunta contextual tiene un id o una clase inválidos")
    return preguntas


def _ruta_del_informe(directorio: Path) -> str:
    resuelta = directorio.resolve()
    raiz = raiz_repo().resolve()
    return resuelta.relative_to(raiz).as_posix() if resuelta.is_relative_to(raiz) else resuelta.name


def _leer(ruta: Path, nombre: str) -> dict[str, Any]:
    try:
        contenido = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise DatasetInvalido(f"no se pudo leer {nombre} del dataset de contextual") from None
    if not isinstance(contenido, dict):
        raise DatasetInvalido(f"{nombre} del dataset de contextual no es un mapa")
    return contenido


def _leer_json(ruta: Path) -> dict[str, Any]:
    try:
        contenido = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise DatasetInvalido("no se pudo leer el fixture de casos") from None
    if not isinstance(contenido, dict):
        raise DatasetInvalido("el fixture de casos no es un mapa")
    return contenido
