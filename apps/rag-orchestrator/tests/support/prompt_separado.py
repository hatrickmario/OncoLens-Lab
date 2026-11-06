"""Aserciones compartidas de la separación instrucciones/datos (US-057, SEG-13).

``bloques()`` parsea el mensaje de usuario por etiqueta; ``afirmar_separacion()`` reúne AC-1…AC-4 en una aserción que
reutilizan los prompts del chat (``l1d-317`` nodo ``caso``, ``l1d-322`` nodo ``evidencia``).
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import NamedTuple

from app.application.prompt_builder import ETIQUETAS_RESERVADAS, PromptSeparado

_ETIQUETAS = "|".join(ETIQUETAS_RESERVADAS)
_BLOQUE = re.compile(rf"<({_ETIQUETAS})([^<>]*)>(.*?)</\1>", re.DOTALL)
_APERTURA_O_CIERRE = re.compile(rf"<\s*/?\s*(?:{_ETIQUETAS})\b", re.IGNORECASE)


class Bloque(NamedTuple):
    etiqueta: str
    atributos: str
    texto: str


def bloques(usuario: str) -> list[Bloque]:
    """Bloques del mensaje de usuario en orden de aparición, con el texto sin el salto de línea de los extremos."""
    return [Bloque(m[1], m[2].strip(), m[3].strip("\n")) for m in _BLOQUE.finditer(usuario)]


def hash_del_sistema(sistema: str) -> str:
    return hashlib.sha256(sistema.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class DatosDelPrompt:
    """Los datos que el test entregó al constructor, tal cual (sin escapar), y el sistema de referencia sin datos inyectados."""

    pregunta: str | None = None
    documentos: Mapping[str, str] = field(default_factory=dict)
    datos_del_paciente: str | None = None
    memoria: str | None = None
    sistema_de_referencia: str | None = None


def afirmar_separacion(prompt: PromptSeparado | str, datos: DatosDelPrompt) -> None:
    """Falla si el prompt no separa instrucciones y datos: cadena única, dato en el sistema, bloque de más o de menos,
    delimitador del dato sin escapar o sistema distinto del de referencia."""
    assert isinstance(prompt, PromptSeparado), (
        "el prompt debe salir de PromptBuilder, no ser una cadena única"
    )
    encontrados = bloques(prompt.usuario)
    esperados = {
        "question": [datos.pregunta] if datos.pregunta is not None else [],
        "document": list(datos.documentos.values()),
        "patient_data": [datos.datos_del_paciente] if datos.datos_del_paciente is not None else [],
        "memory": [datos.memoria] if datos.memoria is not None else [],
    }
    for etiqueta, textos in esperados.items():
        cuantos = sum(1 for b in encontrados if b.etiqueta == etiqueta)
        assert cuantos == len(textos), f"bloques <{etiqueta}>: {cuantos} en lugar de {len(textos)}"
        for texto in textos:
            assert texto not in prompt.sistema, f"un dato de <{etiqueta}> está en el mensaje de sistema"
    for alias in datos.documentos:
        assert any(b.atributos == f'id="{alias}"' for b in encontrados if b.etiqueta == "document"), alias
    restante = _BLOQUE.sub("", prompt.usuario)
    assert not _APERTURA_O_CIERRE.search(restante), "un delimitador del dato quedó sin escapar"
    if datos.sistema_de_referencia is not None:
        assert hash_del_sistema(prompt.sistema) == hash_del_sistema(datos.sistema_de_referencia), (
            "el mensaje de sistema cambió con los datos"
        )
