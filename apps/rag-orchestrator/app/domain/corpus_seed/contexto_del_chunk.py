"""Contexto del documento en el texto que se embebe de un chunk (US-279, L1D-337): reglas puras, sin E/S.

El prefijo es una entrada de los codificadores *dense* y *sparse*: nunca se almacena ni se cita (RN-04). Con ``ninguno`` el texto que
se embebe es el original, byte a byte. Los metadatos salen del catálogo y un valor ausente se omite, sin texto de relleno (RN-25).
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Final


class VarianteDeContexto(StrEnum):
    NINGUNO = "ninguno"
    DETERMINISTA = "determinista"
    LLM = "llm"


# Único lugar de los valores iniciales (RN-22): ``Settings`` los lee de aquí.
VARIANTE_INICIAL: Final = VarianteDeContexto.NINGUNO
# Cambia si cambia el formato del prefijo: entra en el nombre de la colección de la variante y en el reporte.
VERSION_DE_LA_PLANTILLA: Final = 1
CONTEXTO_MAX_CHARS_INICIAL: Final = 300
CONTEXTO_LLM_MAX_CHARS_INICIAL: Final = 300
CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL: Final = 4000
CONTEXTO_LLM_CONCURRENCIA_INICIAL: Final = 4
CONTEXTO_REINDEXACION_LOTE_INICIAL: Final = 64

# Sección de un chunk de un documento sin secciones: no es un encabezado y no entra en el prefijo.
SECCION_UNICA: Final = "texto_completo"
SEPARADOR_DE_CAMPOS: Final = " | "
TERMINADOR_DEL_CONTEXTO: Final = "\n\n"
CLAVE_DE_LA_FRASE: Final = "contexto"


@dataclass(frozen=True)
class MetadatosDelContexto:
    """Los campos del catálogo que entran al prefijo; ``None`` o vacío = ausente."""

    titulo: str | None
    tipo_de_fuente: str | None
    tipo_de_cancer: str | None


def contexto_determinista(
    metadatos: MetadatosDelContexto | None, seccion: str | None, max_chars: int
) -> str:
    """Título, tipo de fuente, tipo de cáncer y sección, en ese orden, terminados en una línea en blanco (RN-25).

    Sin etiquetas (el corpus es bilingüe); un valor ausente o vacío se omite, igual que la sección de un documento sin secciones, y
    nunca se escribe «No disponible». El prefijo mide como máximo ``max_chars``: el recorte corta el título, nunca el resto, y es
    determinista (misma entrada, mismo prefijo).
    """
    titulo = _limpio(metadatos.titulo) if metadatos else ""
    resto = _campos_despues_del_titulo(metadatos, seccion)
    if max_chars <= len(TERMINADOR_DEL_CONTEXTO) or not (titulo or resto):
        return ""
    limite = max_chars - len(TERMINADOR_DEL_CONTEXTO)
    cuerpo = SEPARADOR_DE_CAMPOS.join([titulo, *resto] if titulo else resto)
    if len(cuerpo) > limite:
        cuerpo = _cuerpo_recortado(titulo, resto, limite)
    return cuerpo + TERMINADOR_DEL_CONTEXTO if cuerpo else ""


def _limpio(valor: str | None) -> str:
    return (valor or "").strip()


def _campos_despues_del_titulo(
    metadatos: MetadatosDelContexto | None, seccion: str | None
) -> list[str]:
    fuente = _limpio(metadatos.tipo_de_fuente) if metadatos else ""
    cancer = _etiquetas_separadas(metadatos.tipo_de_cancer) if metadatos else ""
    encabezado = "" if _limpio(seccion) == SECCION_UNICA else _limpio(seccion)
    return [campo for campo in (fuente, cancer, encabezado) if campo]


def _etiquetas_separadas(etiquetas: str | None) -> str:
    """Las etiquetas del catálogo vienen separadas por coma sin espacios (``mama,prostata``): en el prefijo, coma y espacio."""
    partes = (parte.strip() for parte in (etiquetas or "").split(","))
    return ", ".join(parte for parte in partes if parte)


def _cuerpo_recortado(titulo: str, resto: list[str], limite: int) -> str:
    """El título cede lo que sobra; si el resto solo ya no cabe, el título se descarta y el resto se corta al límite."""
    fijo = SEPARADOR_DE_CAMPOS.join(resto)
    if titulo and resto:
        disponible = limite - len(fijo) - len(SEPARADOR_DE_CAMPOS)
        if disponible > 0:
            return titulo[:disponible].rstrip() + SEPARADOR_DE_CAMPOS + fijo
    return (titulo if not resto else fijo)[:limite].rstrip()


def contexto_con_frase(contexto_determinista_del_chunk: str, frase: str) -> str:
    """El prefijo de la variante ``llm``: el determinista seguido de la frase validada y de una línea en blanco."""
    return f"{contexto_determinista_del_chunk}{frase}{TERMINADOR_DEL_CONTEXTO}"


def indices_pedidos(fragmentos: Sequence[str], pendientes: Sequence[int] | None) -> Sequence[int]:
    """Los índices de chunk cuyo texto se pide: todos si ``pendientes`` es ``None``."""
    return range(len(fragmentos)) if pendientes is None else pendientes


def seccion_del_chunk(secciones: Sequence[str] | None, indice: int) -> str | None:
    """La sección del chunk ``indice``; ``None`` si el documento no declara secciones."""
    return None if secciones is None else secciones[indice]


def texto_a_embeber(contexto: str, chunk_text: str) -> str:
    """El texto que entra a los codificadores; con contexto vacío, ``chunk_text`` tal cual (RN-04)."""
    return f"{contexto}{chunk_text}" if contexto else chunk_text


def inicio_del_documento(chunks_en_orden: Iterable[tuple[int, str]], max_chars: int) -> str:
    """Los chunks vigentes de un documento por orden de índice, concatenados y recortados a ``max_chars`` (RN-21).

    Es la única entrada de documento que recibe el LLM de la variante ``llm``, en la ingesta y en la reindexación: el documento
    original no se persiste. El solapamiento entre chunks contiguos queda repetido.
    """
    return "\n".join(texto for _, texto in sorted(chunks_en_orden))[:max_chars]


def validar_frase_de_contexto(salida_cruda: str, max_chars: int) -> str | None:
    """La frase de una salida del LLM que cumple el esquema, o ``None`` si no hay frase utilizable (RN-21).

    Esquema: un objeto JSON con la única clave ``contexto``, cadena no vacía de una sola línea y de a lo sumo ``max_chars``.
    """
    try:
        salida = json.loads(salida_cruda)
    except ValueError:
        return None
    if not isinstance(salida, dict) or set(salida) != {CLAVE_DE_LA_FRASE}:
        return None
    frase = salida[CLAVE_DE_LA_FRASE]
    if not isinstance(frase, str):
        return None
    frase = frase.strip()
    if not frase or "\n" in frase or "\r" in frase or len(frase) > max_chars:
        return None
    return frase
