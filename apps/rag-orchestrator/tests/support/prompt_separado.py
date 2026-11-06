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

from app.application.prompt_builder import (
    ETIQUETAS_RESERVADAS,
    PromptSeparado,
    escapar_delimitadores,
)

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


def texto_completo(prompt: PromptSeparado) -> str:
    """Sistema y usuario juntos: para aserciones de contenido que no dependen de en qué mensaje va cada parte."""
    return f"{prompt.sistema}\n\n{prompt.usuario}"


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


def _esperados(datos: DatosDelPrompt) -> dict[str, list[tuple[str, str]]]:
    """Por etiqueta reservada, los (atributos, dato sin escapar) que el constructor debió envolver, en orden."""
    unicos = {
        "question": ("", datos.pregunta),
        "patient_data": ("", datos.datos_del_paciente),
        "memory": ('citable="no"', datos.memoria),
    }
    esperados: dict[str, list[tuple[str, str]]] = {e: [] for e in ETIQUETAS_RESERVADAS}
    for etiqueta, (atributos, dato) in unicos.items():
        if dato is not None:
            esperados[etiqueta].append((atributos, dato))
    esperados["document"] = [(f'id="{a}"', d) for a, d in datos.documentos.items()]
    return esperados


def afirmar_separacion(prompt: PromptSeparado | str, datos: DatosDelPrompt) -> None:
    """Falla si el prompt no separa instrucciones y datos: cadena única, dato en el sistema, bloque de más o de menos,
    delimitador del dato sin escapar o sistema distinto del de referencia."""
    assert isinstance(prompt, PromptSeparado), (
        "el prompt debe salir de PromptBuilder, no ser una cadena única"
    )
    encontrados = bloques(prompt.usuario)
    esperados = _esperados(datos)
    assert set(esperados) == set(ETIQUETAS_RESERVADAS)
    for etiqueta, bloques_esperados in esperados.items():
        reales = [(b.atributos, b.texto) for b in encontrados if b.etiqueta == etiqueta]
        assert len(reales) == len(bloques_esperados), (
            f"bloques <{etiqueta}>: {len(reales)} en lugar de {len(bloques_esperados)}"
        )
        for (atributos, texto), (atributos_esperados, dato) in zip(
            reales, bloques_esperados, strict=True
        ):
            assert atributos == atributos_esperados, f"atributos de <{etiqueta}>: {atributos}"
            assert texto == escapar_delimitadores(dato), f"el bloque <{etiqueta}> trae otro texto"
            assert dato not in prompt.sistema, (
                f"un dato de <{etiqueta}> está en el mensaje de sistema"
            )
    restante = _BLOQUE.sub("", prompt.usuario)
    assert not _APERTURA_O_CIERRE.search(restante), "un delimitador del dato quedó sin escapar"
    if datos.sistema_de_referencia is not None:
        assert hash_del_sistema(prompt.sistema) == hash_del_sistema(datos.sistema_de_referencia), (
            "el mensaje de sistema cambió con los datos"
        )
