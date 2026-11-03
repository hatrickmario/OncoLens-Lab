"""La política de lenguaje de la línea base de US-068 (lista 1.5.0, solo Nivel A) para medir la regresión de falsos positivos.

La copia fija de la lista vive en ``data/eval/fx-rn23/linea-base/``. La lista 1.5.0 no declara ``salidaGenerada``: su filtro
aplicaba solo el Nivel A, y eso es lo que reproduce ``REGLAS_DE_LA_LINEA_BASE`` (US-249 AC-5). Solo la suite lo usa.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.domain.lenguaje import ListaTerminos, ReglasDeSalidaGenerada
from app.infrastructure.lenguaje.terminos_prohibidos import VerificadorDeTerminosProhibidos

REGLAS_DE_LA_LINEA_BASE = ReglasDeSalidaGenerada(("A",), frozenset(), frozenset())


class LineaBaseDeLenguajeInvalida(ValueError):
    """La copia fija de la lista 1.5.0 no se pudo leer o no es válida; el mensaje nunca lleva la ruta ni el contenido."""


def cargar_lista_de_linea_base(ruta: Path) -> ListaTerminos:
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        # 1.5.0 es anterior a salidaGenerada: se completa solo para validar con el esquema vigente; no se aplica.
        datos.setdefault("salidaGenerada", {"nivelB": [datos["nivelB"]["prefijos"][0]["id"]]})
        return ListaTerminos.model_validate(datos)
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        raise LineaBaseDeLenguajeInvalida("la lista de la línea base no está disponible") from None


def verificador_de_la_linea_base(ruta: Path) -> VerificadorDeTerminosProhibidos:
    """El filtro de producción de US-068: el mismo adapter, con la lista 1.5.0 y solo el Nivel A."""
    return VerificadorDeTerminosProhibidos(
        cargar_lista_de_linea_base(ruta), REGLAS_DE_LA_LINEA_BASE
    )
