"""Carga de ``data/eval/pii-mini`` (sintetico, RN-13): materializa en memoria y verifica las huellas del manifiesto.

Los valores de PII sembrada existen solo en memoria durante la medicion; este modulo nunca los escribe.
"""

from __future__ import annotations

import importlib.util
import json
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType

from app.evaluation.rutas import raiz_repo
from app.scripts.adr40.reglas import Control, Span

DIRECTORIO = Path("data") / "eval" / "pii-mini"
CONTEXTO_DE_DOCUMENTO = "documento"


class DatasetInvalido(Exception):
    """El dataset no es sintetico o su huella no coincide con el manifiesto."""


@dataclass(frozen=True)
class TextoSembrado:
    id: str
    contexto: str
    texto: str
    etiquetas: tuple[Span, ...]
    controles: tuple[Control, ...]


def _importar_generador(directorio: Path) -> ModuleType:
    especificacion = importlib.util.spec_from_file_location(
        "pii_mini_generar", directorio / "generar.py"
    )
    if especificacion is None or especificacion.loader is None:
        raise DatasetInvalido(f"no se puede importar {directorio / 'generar.py'}")
    modulo = importlib.util.module_from_spec(especificacion)
    especificacion.loader.exec_module(modulo)
    return modulo


def cargar_corpus(raiz: Path | None = None) -> list[TextoSembrado]:
    directorio = (raiz or raiz_repo()) / DIRECTORIO
    manifiesto = json.loads((directorio / "manifest.json").read_text(encoding="utf-8"))
    if manifiesto.get("clase") != "sintetico":
        raise DatasetInvalido("pii-mini debe declarar clase sintetico (RN-13)")
    generador = _importar_generador(directorio)
    crudo = generador.materializar(manifiesto["semilla"], manifiesto["identidades"], directorio)
    if (
        generador.huella(crudo) != manifiesto["sha256_corpus"]
        or generador.huella_de_plantillas(directorio) != manifiesto["sha256_plantillas"]
    ):
        raise DatasetInvalido("las huellas de pii-mini no coinciden con manifest.json")
    return [
        TextoSembrado(
            t["id"],
            t["contexto"],
            t["texto"],
            tuple(Span(e["inicio"], e["fin"], e["tipo"]) for e in t["etiquetas"]),
            tuple(
                Control(c["termino"], c["inicio"], c["fin"], c["critico"]) for c in t["controles"]
            ),
        )
        for t in crudo
    ]
