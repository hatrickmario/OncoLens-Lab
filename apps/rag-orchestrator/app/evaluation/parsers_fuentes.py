"""Extracción de secciones de las fuentes públicas del mini-dataset (JATS, ClinicalTrials.gov v2, HTML de NCI).

Funciones puras sobre bytes: sin red ni disco. Los textos resultantes viven solo en memoria durante
la medición; nunca se versionan (RN-14, tarea 1.11).
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from html.parser import HTMLParser
from typing import Any
from xml.etree.ElementTree import Element

from defusedxml import ElementTree as SafeET

from app.evaluation.chunking_variants import Seccion

_ESPACIOS = re.compile(r"\s+")


_ETIQUETAS_CON_ESPACIO = {"sub", "sup"}


def _fragmentos(elemento: Element) -> Iterator[str]:
    """Texto del elemento; los subíndices y superíndices se separan con espacio, como en el texto renderizado."""
    separador = " " if _quitar_ns(elemento.tag) in _ETIQUETAS_CON_ESPACIO else ""
    yield separador
    if elemento.text:
        yield elemento.text
    for hijo in elemento:
        yield from _fragmentos(hijo)
        if hijo.tail:
            yield hijo.tail
    yield separador


def _texto(elemento: Element) -> str:
    return _ESPACIOS.sub(" ", "".join(_fragmentos(elemento))).strip()


def _quitar_ns(etiqueta: str) -> str:
    return etiqueta.rsplit("}", 1)[-1]


def _hijos(elemento: Element, nombre: str) -> Iterator[Element]:
    return (h for h in elemento if _quitar_ns(h.tag) == nombre)


def parsear_jats(contenido: bytes) -> list[Seccion]:
    """Título, resumen y cada sección de primer nivel del cuerpo (las subsecciones se aplanan dentro de su sección)."""
    raiz = SafeET.fromstring(contenido)
    secciones: list[Seccion] = []
    titulo = next(raiz.iter("article-title"), None)
    if titulo is not None:
        secciones.append(Seccion("Título", _texto(titulo)))
    for resumen in raiz.iter("abstract"):
        secciones.append(Seccion("Resumen", _texto(resumen)))
    cuerpo = next(raiz.iter("body"), None)
    if cuerpo is not None:
        for sec in _hijos(cuerpo, "sec"):
            titulo_sec = next(_hijos(sec, "title"), None)
            nombre = _texto(titulo_sec) if titulo_sec is not None else "Sección"
            secciones.append(Seccion(nombre, _texto(sec)))
        sueltos = [_texto(p) for p in _hijos(cuerpo, "p")]
        if sueltos:
            secciones.append(Seccion("Cuerpo", " ".join(sueltos)))
    return [s for s in secciones if s.texto]


def _aplanar_json(valor: Any) -> Iterator[str]:
    if isinstance(valor, str):
        yield valor
    elif isinstance(valor, dict):
        for v in valor.values():
            yield from _aplanar_json(v)
    elif isinstance(valor, list):
        for v in valor:
            yield from _aplanar_json(v)


def _nombre_modulo(clave: str) -> str:
    return re.sub(r"Module$", "", clave)


def parsear_registro_ctgov(contenido: bytes) -> list[Seccion]:
    """Un campo por módulo del registro (identificación, descripción, elegibilidad, resultados…)."""
    estudio = json.loads(contenido)
    secciones: list[Seccion] = []
    for bloque, modulos in (
        ("protocolo", estudio.get("protocolSection", {})),
        ("resultados", estudio.get("resultsSection", {})),
    ):
        for clave, modulo in modulos.items():
            texto = " ".join(t.strip() for t in _aplanar_json(modulo) if t.strip())
            if texto:
                secciones.append(Seccion(f"{bloque}:{_nombre_modulo(clave)}", texto))
    return secciones


class _ExtractorNci(HTMLParser):
    """Texto visible del contenido principal de una página de cancer.gov, cortado por encabezados."""

    # Los gráficos (img, svg) no se descargan ni se usan; los pies de figura son texto y se conservan.
    OMITIR = {"script", "style", "noscript", "svg", "nav", "header", "footer", "aside", "button", "form"}
    ENCABEZADOS = {"h1", "h2", "h3", "h4"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._en_main = 0
        self._omitir = 0
        self._en_encabezado = False
        self._encabezado: list[str] = []
        self._actual = ""
        self._partes: list[str] = []
        self.secciones: list[Seccion] = []

    def _cerrar_seccion(self) -> None:
        texto = _ESPACIOS.sub(" ", " ".join(self._partes)).strip()
        if texto:
            self.secciones.append(Seccion(self._actual, texto))
        self._partes = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "main" or dict(attrs).get("id") == "main-content":
            self._en_main += 1
        if not self._en_main:
            return
        if tag in self.OMITIR:
            self._omitir += 1
        elif tag in self.ENCABEZADOS and not self._omitir:
            self._cerrar_seccion()
            self._en_encabezado = True
            self._encabezado = []

    def handle_endtag(self, tag: str) -> None:
        if not self._en_main:
            return
        if tag in self.OMITIR and self._omitir:
            self._omitir -= 1
        elif tag in self.ENCABEZADOS and self._en_encabezado:
            self._actual = _ESPACIOS.sub(" ", " ".join(self._encabezado)).strip()
            self._en_encabezado = False
        elif tag == "main":
            self._en_main -= 1

    def handle_data(self, data: str) -> None:
        if not self._en_main or self._omitir:
            return
        (self._encabezado if self._en_encabezado else self._partes).append(data)

    def terminar(self) -> list[Seccion]:
        self._cerrar_seccion()
        return self.secciones


def parsear_html_nci(contenido: bytes) -> list[Seccion]:
    """Secciones por encabezado (h1–h4) del contenido principal; sin gráficos ni navegación."""
    extractor = _ExtractorNci()
    extractor.feed(contenido.decode("utf-8", errors="replace"))
    return extractor.terminar()


PARSERS = {"jats_xml": parsear_jats, "json_api": parsear_registro_ctgov, "html": parsear_html_nci}
