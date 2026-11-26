"""Contexto del documento en el texto que se embebe de un chunk (US-279, L1D-337): reglas puras, sin E/S.

El prefijo es una entrada de los codificadores *dense* y *sparse*: nunca se almacena ni se cita (RN-04). Con ``ninguno`` el texto que
se embebe es el original, byte a byte. Los metadatos salen del catálogo y un valor ausente se omite, sin texto de relleno (RN-25).
"""

from __future__ import annotations

from collections.abc import Iterable
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


@dataclass(frozen=True)
class MetadatosDelContexto:
    """Los campos del catálogo que entran al prefijo; ``None`` o vacío = ausente."""

    titulo: str | None
    tipo_de_fuente: str | None
    tipo_de_cancer: str | None


def contexto_determinista(
    metadatos: MetadatosDelContexto | None, seccion: str | None, max_chars: int
) -> str:
    """Título, tipo de fuente, tipo de cáncer y sección, en ese orden, terminados en una línea en blanco (RN-25)."""
    raise NotImplementedError("no implementado")


def contexto_con_frase(contexto_determinista_del_chunk: str, frase: str) -> str:
    """El prefijo de la variante ``llm``: el determinista seguido de la frase validada y de una línea en blanco."""
    raise NotImplementedError("no implementado")


def texto_a_embeber(contexto: str, chunk_text: str) -> str:
    """El texto que entra a los codificadores; con contexto vacío, ``chunk_text`` tal cual (RN-04)."""
    raise NotImplementedError("no implementado")


def inicio_del_documento(chunks_en_orden: Iterable[tuple[int, str]], max_chars: int) -> str:
    """Los chunks vigentes de un documento por orden de índice, concatenados y recortados a ``max_chars`` (RN-21)."""
    raise NotImplementedError("no implementado")


def validar_frase_de_contexto(salida_cruda: str, max_chars: int) -> str | None:
    """La frase de una salida del LLM que cumple el esquema, o ``None`` si no hay frase utilizable (RN-21)."""
    raise NotImplementedError("no implementado")
