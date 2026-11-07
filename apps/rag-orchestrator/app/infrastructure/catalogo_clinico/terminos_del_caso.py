"""Catálogo del segundo loop contextual (US-271, ADR-52, RN-27): léxico del gate G1 y términos del caso.

Solo lectura del catálogo montado (``CLINICAL_CATALOG_PATH``): ``lenguaje/marcos-de-pregunta.json``, ``escalas.json`` y, por
tipo, ``codigos.json`` y ``datos-criticos.json``. Un archivo ilegible o fuera de forma es ``CatalogoNoDisponible`` (el mensaje
nunca lleva la ruta ni el contenido). El sistema de gradación que entra a la consulta es Gleason/ISUP (PRD B-08).
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from app.domain.lenguaje import normalizar_texto
from app.domain.pregunta_sin_tema_propio import MarcosDeIdioma, MarcosDePregunta
from app.domain.terminos_del_caso import BiomarcadorDelCatalogo, CatalogoDeTerminos
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible

ARCHIVO_DE_MARCOS = Path("lenguaje") / "marcos-de-pregunta.json"
ESTANDAR_DEL_TIPO = "cie10"
SISTEMA_DE_GRADO_EN_LA_CONSULTA = "gleason_isup"
IDIOMAS_DEL_LEXICO = ("es", "en")


def _leer(archivo: Path) -> Any:
    try:
        return json.loads(archivo.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise CatalogoNoDisponible(f"{archivo.name} no está disponible") from None


def cargar_marcos_de_pregunta(catalogos: Path) -> MarcosDePregunta:
    contenido = _leer(catalogos / ARCHIVO_DE_MARCOS)
    try:
        return MarcosDePregunta(
            version=str(contenido["version"]),
            por_idioma={
                idioma: MarcosDeIdioma(
                    marcos=tuple(normalizar_texto(m) for m in contenido[idioma]["marcos"]),
                    vacias=frozenset(normalizar_texto(v) for v in contenido[idioma]["vacias"]),
                )
                for idioma in IDIOMAS_DEL_LEXICO
            },
        )
    except (KeyError, TypeError):
        raise CatalogoNoDisponible(f"{ARCHIVO_DE_MARCOS.name} no está disponible") from None


def cargar_catalogo_de_terminos(
    catalogos: Path, tipos_de_cancer: Sequence[str]
) -> CatalogoDeTerminos:
    escalas = _leer(catalogos / "escalas.json")
    try:
        etiqueta_de_tipo: dict[str, str] = {}
        biomarcadores: dict[str, tuple[BiomarcadorDelCatalogo, ...]] = {}
        valores_por_biomarcador = _valores_de_biomarcador(escalas)
        for tipo in tipos_de_cancer:
            codigos = _leer(catalogos / tipo / "codigos.json")["entradas"]
            etiquetas = {
                normalizar_texto(e["terminoCanonico"]): e["etiquetaEs"]
                for e in codigos
                if e.get("etiquetaEs")
            }
            tipo_etiquetado = next(
                (
                    e["etiquetaEs"]
                    for e in codigos
                    if e["estandar"] == ESTANDAR_DEL_TIPO
                    and normalizar_texto(e["terminoCanonico"]) == normalizar_texto(tipo)
                ),
                None,
            )
            if tipo_etiquetado is not None:
                etiqueta_de_tipo[tipo] = tipo_etiquetado
            criticos = _leer(catalogos / tipo / "datos-criticos.json")["items"]
            biomarcadores[tipo] = _biomarcadores_en_orden(
                criticos, etiquetas, valores_por_biomarcador, tipo
            )
        return CatalogoDeTerminos(
            etiqueta_de_tipo=etiqueta_de_tipo,
            estadios=_estadios_por_tipo(escalas, tipos_de_cancer),
            grados=_grados_por_tipo(escalas, tipos_de_cancer),
            biomarcadores=biomarcadores,
        )
    except (KeyError, TypeError, AttributeError):
        raise CatalogoNoDisponible("el catálogo de términos del caso no está disponible") from None


def _valores_de_biomarcador(escalas: dict[str, Any]) -> dict[tuple[str, str], dict[str, str]]:
    """``(tipo, nombre normalizado)`` -> {valor normalizado: valor canónico} de ``valoresDeBiomarcador``."""
    return {
        (tipo, normalizar_texto(b["nombre"])): {normalizar_texto(v): v for v in b["valores"]}
        for b in escalas.get("valoresDeBiomarcador", [])
        for tipo in b["tiposDeCancer"]
    }


def _biomarcadores_en_orden(
    criticos: Sequence[dict[str, Any]],
    etiquetas: dict[str, str],
    valores: dict[tuple[str, str], dict[str, str]],
    tipo: str,
) -> tuple[BiomarcadorDelCatalogo, ...]:
    """Los biomarcadores de ``datos-criticos`` (destino ``Biomarker``) en su orden y sin repetir el nombre."""
    vistos: dict[str, BiomarcadorDelCatalogo] = {}
    for item in criticos:
        destino = item.get("destination", {})
        nombre = destino.get("match", {}).get("name")
        if destino.get("entity") != "Biomarker" or not nombre:
            continue
        clave = normalizar_texto(nombre)
        if clave not in vistos:
            vistos[clave] = BiomarcadorDelCatalogo(
                nombre=clave,
                termino=etiquetas.get(clave, nombre),
                valores=valores.get((tipo, clave), {}),
            )
    return tuple(vistos.values())


def _estadios_por_tipo(
    escalas: dict[str, Any], tipos: Sequence[str]
) -> dict[str, dict[str, dict[str, str]]]:
    return {
        tipo: {
            normalizar_texto(sistema["codigo"]): {
                normalizar_texto(v): v for v in sistema["valores"]
            }
            for sistema in escalas.get("sistemasDeEstadificacion", [])
            if tipo in sistema["tiposDeCancer"] and sistema.get("valores")
        }
        for tipo in tipos
    }


def _grados_por_tipo(escalas: dict[str, Any], tipos: Sequence[str]) -> dict[str, tuple[str, ...]]:
    return {
        tipo: tuple(
            valor
            for sistema in escalas.get("sistemasDeGradacion", [])
            if sistema["codigo"] == SISTEMA_DE_GRADO_EN_LA_CONSULTA
            and tipo in sistema["tiposDeCancer"]
            for valor in sistema.get("valores", [])
        )
        for tipo in tipos
    }
