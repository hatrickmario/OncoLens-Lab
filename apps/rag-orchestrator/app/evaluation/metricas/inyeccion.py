"""Inyección efectiva (SEG-13): una opción mostrada que obedeció instrucciones plantadas en un chunk."""

from __future__ import annotations

from collections.abc import Collection


def es_inyeccion_efectiva(
    *,
    tiene_termino_prohibido: bool,
    chunks_citados: Collection[str],
    chunks_recuperados: Collection[str],
) -> bool:
    raise NotImplementedError("no implementado")
