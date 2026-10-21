"""Puerto ``FuenteDataset`` de la suite `evaluate` (US-072, RN-13, RN-14): lee un directorio con ``manifest.yaml``.

Un dataset DENTRO del repositorio debe declarar ``clase: sintetico`` en su manifiesto y en cada archivo; si no, se
rechaza con ``DatasetInvalido`` antes de cargar ninguna pregunta. Un dataset fuera del repo puede ser
``real_anonimizado`` (calibración local, nunca en la CI): la guarda de proveedores locales la aplica el runner.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Protocol

import yaml

from app.evaluation.dataset_loader import CLASE_SINTETICA, DatasetInvalido, Evidencia, Pregunta

CLASE_REAL_ANONIMIZADO = "real_anonimizado"
CLASES_ADMITIDAS = (CLASE_SINTETICA, CLASE_REAL_ANONIMIZADO)


@dataclass(frozen=True)
class DocumentoCorpus:
    id: str
    titulo: str
    cancer: str


@dataclass(frozen=True)
class ChunkCorpus:
    id: str
    documento: str
    texto: str


@dataclass(frozen=True)
class OpcionPropuesta:
    opcion: str
    justificacion: str
    citas: tuple[str, ...]


@dataclass(frozen=True)
class DatasetSuite:
    nombre: str
    version: str
    clase: str
    preguntas: tuple[Pregunta, ...]
    revisadas: frozenset[str]
    release: str
    corte: date
    documentos: tuple[DocumentoCorpus, ...]
    chunks: tuple[ChunkCorpus, ...]
    propuestas: dict[str, tuple[OpcionPropuesta, ...]]
    textos_pii: tuple[str, ...]
    salidas_prescriptivas: tuple[str, ...]


class FuenteDataset(Protocol):
    def clase(self) -> str:
        """Clase declarada en el manifiesto, sin cargar ninguna pregunta."""
        ...

    def cargar(self) -> DatasetSuite: ...


def _leer(ruta: Path) -> dict[str, Any]:
    try:
        contenido = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise DatasetInvalido(f"no se pudo leer {ruta.name}") from None
    if not isinstance(contenido, dict):
        raise DatasetInvalido(f"{ruta.name} no es un mapa YAML")
    return contenido


def ids_de_subconjunto(particion: Path, subconjunto: str) -> frozenset[str]:
    """Ids de pregunta asignados a ``subconjunto`` en la partición congelada (ADR-45 P2)."""
    asignacion = _leer(particion / "particion.yaml").get("asignacion", {})
    return frozenset(str(i) for i in asignacion.get(subconjunto, []))


class FuenteDatasetEnDirectorio:
    def __init__(
        self,
        directorio: Path,
        solo_ids: frozenset[str] | None = None,
        raiz: Path | None = None,
    ) -> None:
        self._directorio = directorio
        self._solo_ids = solo_ids
        self._raiz = raiz

    def clase(self) -> str:
        return str(_leer(self._directorio / "manifest.yaml").get("clase"))

    def cargar(self) -> DatasetSuite:
        try:
            return self._cargar()
        except DatasetInvalido:
            raise
        except (KeyError, TypeError, ValueError, AttributeError):
            raise DatasetInvalido("la estructura del dataset no es válida") from None

    def _cargar(self) -> DatasetSuite:
        manifiesto = _leer(self._directorio / "manifest.yaml")
        clase = self._exigir_clase_admitida(manifiesto)
        archivos = manifiesto.get("archivos", {})
        partes = {
            nombre: self._leer_con_clase(archivos.get(nombre, f"{nombre}.yaml"), clase)
            for nombre in ("corpus", "preguntas", "propuestas", "pii", "prescriptivas")
        }
        preguntas, revisadas = self._preguntas(partes["preguntas"])
        corpus = partes["corpus"]
        return DatasetSuite(
            nombre=str(manifiesto.get("nombre", self._directorio.name)),
            version=str(manifiesto.get("version", "")),
            clase=clase,
            preguntas=preguntas,
            revisadas=revisadas,
            release=str(corpus["release"]),
            corte=date.fromisoformat(str(corpus["corte"])),
            documentos=tuple(
                DocumentoCorpus(str(d["id"]), str(d["titulo"]), str(d["cancer"]))
                for d in corpus.get("documentos", [])
            ),
            chunks=tuple(
                ChunkCorpus(str(c["id"]), str(c["documento"]), str(c["texto"]))
                for c in corpus.get("chunks", [])
            ),
            propuestas={
                str(pid): tuple(
                    OpcionPropuesta(o["opcion"], o["justificacion"], tuple(o["citas"]))
                    for o in opciones
                )
                for pid, opciones in partes["propuestas"].get("propuestas", {}).items()
            },
            textos_pii=tuple(str(t["texto"]) for t in partes["pii"].get("textos", [])),
            salidas_prescriptivas=tuple(
                str(s["texto"]) for s in partes["prescriptivas"].get("salidas", [])
            ),
        )

    def _exigir_clase_admitida(self, manifiesto: dict[str, Any]) -> str:
        clase = str(manifiesto.get("clase"))
        if clase not in CLASES_ADMITIDAS:
            raise DatasetInvalido("el manifiesto no declara una clase de datos admitida (RN-13)")
        return clase

    def _leer_con_clase(self, archivo: str, clase: str) -> dict[str, Any]:
        contenido = _leer(self._directorio / archivo)
        if contenido.get("clase") != clase:
            raise DatasetInvalido(f"{archivo} no declara la misma clase que el manifiesto")
        return contenido

    def _preguntas(self, crudo: dict[str, Any]) -> tuple[tuple[Pregunta, ...], frozenset[str]]:
        elegidas = [
            p
            for p in crudo.get("preguntas", [])
            if self._solo_ids is None or str(p["id"]) in self._solo_ids
        ]
        if not elegidas:
            raise DatasetInvalido("el dataset no tiene preguntas que evaluar")
        preguntas = tuple(_pregunta(p) for p in elegidas)
        revisadas = frozenset(str(p["id"]) for p in elegidas if p.get("revisada_por_oncologo"))
        return preguntas, revisadas


def _pregunta(crudo: dict[str, Any]) -> Pregunta:
    evidencia = tuple(
        Evidencia(str(e["documento"]), str(e["cita"])) for e in crudo.get("evidencia", [])
    )
    return Pregunta(
        id=str(crudo["id"]),
        idioma=str(crudo["idioma"]),
        cancer=str(crudo["cancer"]),
        tipo=str(crudo.get("tipo", "")),
        texto=str(crudo["pregunta"]),
        modo_acierto=str(crudo["modo_acierto"]),
        documentos=tuple(dict.fromkeys(e.documento for e in evidencia)),
        evidencia=evidencia,
        control_de=crudo.get("control_de"),
    )
