"""Variantes de *chunking* de las pruebas T2–T4 de ADR-39 (funciones puras, sin E/S).

El tamaño y el solapamiento se expresan en **tokens del tokenizer del modelo elegido**. Las variantes
cuyo tamaño, con los tokens especiales, supera la longitud máxima de entrada del modelo se omiten y
el reporte las anota (D7, criterio 8). Los chunks conservan ``seccion`` (D8).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

ESTRATEGIA_TAMANO_FIJO = "tamano_fijo"
ESTRATEGIA_ESTRUCTURA = "estructura"
SEPARADOR_SECCIONES = "\n\n"


class Tokenizador(Protocol):
    """Lo mínimo que se necesita del tokenizer del modelo: desplazamientos de caracteres por token."""

    tokens_especiales: int
    max_length: int

    def desplazamientos(self, texto: str) -> list[tuple[int, int]]:
        """(inicio, fin) en caracteres de cada token, sin tokens especiales."""
        ...


@dataclass(frozen=True)
class Seccion:
    nombre: str
    texto: str


@dataclass(frozen=True)
class Variante:
    tamano: int
    solapamiento_pct: float
    estrategia: str

    @property
    def etiqueta(self) -> str:
        return f"{self.estrategia}-{self.tamano}-{int(round(self.solapamiento_pct * 100))}pct"

    @property
    def simplicidad(self) -> int:
        """Menor = más simple: tamaño fijo y 0 % de solapamiento valen 0 (desempate de D8)."""
        return (self.estrategia != ESTRATEGIA_TAMANO_FIJO) + (self.solapamiento_pct > 0)


@dataclass(frozen=True)
class ChunkCandidato:
    documento: str
    texto: str
    seccion: str
    tokens: int


def solapamiento_en_tokens(tamano: int, solapamiento_pct: float) -> int:
    return int(round(tamano * solapamiento_pct))


def variantes_admitidas(
    variantes: Sequence[Variante], tok: Tokenizador
) -> tuple[list[Variante], list[dict[str, object]]]:
    """Separa las variantes que caben en el modelo de las omitidas, con su motivo."""
    admitidas: list[Variante] = []
    omitidas: list[dict[str, object]] = []
    for v in variantes:
        necesarios = v.tamano + tok.tokens_especiales
        if necesarios > tok.max_length:
            omitidas.append(
                {
                    "variante": v.etiqueta,
                    "motivo": f"{necesarios} tokens (con especiales) > longitud máxima {tok.max_length}",
                }
            )
        else:
            admitidas.append(v)
    return admitidas, omitidas


def fragmentar_tamano_fijo(
    documento: str,
    texto: str,
    tok: Tokenizador,
    tamano: int,
    solapamiento_pct: float,
    seccion: str = "",
) -> list[ChunkCandidato]:
    """Ventanas de ``tamano`` tokens con paso ``tamano - solapamiento``; el último chunk puede ser más corto."""
    if tamano <= 0:
        raise ValueError("tamano debe ser positivo")
    solape = solapamiento_en_tokens(tamano, solapamiento_pct)
    if solape >= tamano:
        raise ValueError("el solapamiento debe ser menor que el tamaño")
    offsets = tok.desplazamientos(texto)
    if not offsets:
        return []
    paso = tamano - solape
    chunks: list[ChunkCandidato] = []
    inicio = 0
    while inicio < len(offsets):
        fin = min(inicio + tamano, len(offsets))
        trozo = texto[offsets[inicio][0] : offsets[fin - 1][1]]
        chunks.append(ChunkCandidato(documento, trozo, seccion, fin - inicio))
        if fin == len(offsets):
            break
        inicio += paso
    return chunks


def fragmentar_por_estructura(
    documento: str,
    secciones: Sequence[Seccion],
    tok: Tokenizador,
    tamano: int,
    solapamiento_pct: float,
) -> list[ChunkCandidato]:
    """Respeta los límites de sección: agrupa secciones consecutivas hasta ``tamano`` y parte con tamaño fijo las que lo superan.

    Un texto sin secciones (una sola, sin nombre) cae a tamaño fijo.
    """
    chunks: list[ChunkCandidato] = []
    grupo_texto: list[str] = []
    grupo_tokens = 0
    grupo_nombre = ""

    def vaciar_grupo() -> None:
        nonlocal grupo_texto, grupo_tokens, grupo_nombre
        if grupo_texto:
            chunks.append(
                ChunkCandidato(
                    documento, SEPARADOR_SECCIONES.join(grupo_texto), grupo_nombre, grupo_tokens
                )
            )
        grupo_texto, grupo_tokens, grupo_nombre = [], 0, ""

    for seccion in secciones:
        texto = seccion.texto.strip()
        if not texto:
            continue
        n = len(tok.desplazamientos(texto))
        if n > tamano:
            vaciar_grupo()
            chunks.extend(
                fragmentar_tamano_fijo(
                    documento, texto, tok, tamano, solapamiento_pct, seccion.nombre
                )
            )
            continue
        if grupo_tokens + n > tamano:
            vaciar_grupo()
        if not grupo_texto:
            grupo_nombre = seccion.nombre
        grupo_texto.append(texto)
        grupo_tokens += n
    vaciar_grupo()
    return chunks


def fragmentar(
    documento: str, secciones: Sequence[Seccion], tok: Tokenizador, variante: Variante
) -> list[ChunkCandidato]:
    """Aplica una variante a un documento ya dividido en secciones."""
    if variante.estrategia == ESTRATEGIA_ESTRUCTURA:
        return fragmentar_por_estructura(
            documento, secciones, tok, variante.tamano, variante.solapamiento_pct
        )
    texto = SEPARADOR_SECCIONES.join(s.texto.strip() for s in secciones if s.texto.strip())
    return fragmentar_tamano_fijo(documento, texto, tok, variante.tamano, variante.solapamiento_pct)
