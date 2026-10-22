"""Detectores de PII que ADR-40 compara (US-013). Solo para la medicion: el adapter ``pii/`` de produccion es de S3.

``DetectorDePatrones`` aplica los formatos de un archivo ``pii-formats.json`` (el compartido con el escaner de la CI mas
los de ``formatos_b2.json``) con el modulo ``regex``, que admite ``\\p{L}`` y los grupos ``(?<valor>...)`` de esos
archivos. No aplica las exenciones del escaner (``example.test``, ``SINT-``): un detector que enmascara no debe dejar
pasar un correo solo por su dominio. ``DetectorConNer`` suma el NER de spaCy ``es_core_news_md`` (peso GPL-3.0, descargado
fuera del repo, RN-21); spaCy no entrega puntaje por entidad, por eso ``PII_NER_MIN_SCORE`` solo aplica si se usa Presidio.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any, Protocol

import regex

from app.scripts.adr40.reglas import Span

LONGITUD_MAXIMA_DE_SIGLA = 4
BANDERAS = {"i": regex.IGNORECASE}
TIPO_POR_ETIQUETA_NER = {"PER": "nombre", "LOC": "direccion"}


class DetectorPii(Protocol):
    def detectar(self, texto: str) -> list[Span]: ...


def _alternativa_de_palabra_clave(palabra: str) -> str:
    """Una sigla corta exige limite de palabra; una larga se reconoce tambien dentro de camelCase."""
    escapada = regex.escape(palabra)
    if len(regex.sub(r"[^\p{L}\p{N}]", "", palabra)) <= LONGITUD_MAXIMA_DE_SIGLA:
        return rf"(?<![\p{{L}}\p{{N}}_]){escapada}(?![\p{{L}}_])"
    return escapada


def _compilar(formato: Mapping[str, Any]) -> regex.Pattern[str]:
    palabras = "|".join(_alternativa_de_palabra_clave(p) for p in formato.get("palabrasClave", []))
    banderas = 0
    for letra in formato.get("banderas", ""):
        banderas |= BANDERAS.get(letra, 0)
    return regex.compile(formato["patron"].replace("{{palabrasClave}}", palabras), banderas)


def _cumple_los_digitos(formato: Mapping[str, Any], valor: str) -> bool:
    digitos = sum(c.isdigit() for c in valor)
    return formato.get("digitosMin", 0) <= digitos <= formato.get("digitosMax", len(valor))


def cargar_formatos(rutas: Sequence[Path]) -> list[Mapping[str, Any]]:
    return [f for ruta in rutas for f in json.loads(ruta.read_text(encoding="utf-8"))["formatos"]]


class DetectorDePatrones:
    def __init__(self, formatos: Sequence[Mapping[str, Any]]) -> None:
        self._formatos = [(f, _compilar(f)) for f in formatos]

    def detectar(self, texto: str) -> list[Span]:
        return [
            Span(*coincidencia.span("valor"), formato["tipo"])
            for formato, expresion in self._formatos
            for coincidencia in expresion.finditer(texto)
            if _cumple_los_digitos(formato, coincidencia.group("valor"))
        ]


class DetectorConNer:
    """Patrones mas las entidades PER y LOC de un pipeline de spaCy (se inyecta, ya cargado)."""

    def __init__(self, patrones: DetectorPii, canalizacion: Any) -> None:
        self._patrones = patrones
        self._canalizacion = canalizacion

    def detectar(self, texto: str) -> list[Span]:
        entidades = [
            Span(e.start_char, e.end_char, TIPO_POR_ETIQUETA_NER[e.label_])
            for e in self._canalizacion(texto).ents
            if e.label_ in TIPO_POR_ETIQUETA_NER
        ]
        return [*self._patrones.detectar(texto), *entidades]


def cargar_canalizacion_spacy(modelo: str, version_esperada: str) -> Any:
    """Carga el modelo instalado y comprueba su version exacta (reproducibilidad, RN-21)."""
    import spacy  # solo en la medicion: nunca en requirements.txt

    canalizacion = spacy.load(
        modelo, exclude=["lemmatizer", "morphologizer", "parser", "attribute_ruler"]
    )
    version = canalizacion.meta["version"]
    if version != version_esperada:
        raise ValueError(f"{modelo} {version} instalado, se esperaba {version_esperada}")
    return canalizacion
