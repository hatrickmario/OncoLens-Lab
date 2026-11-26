"""Marca ``revision_provisional`` de los datasets de `evaluate` (``[S7 resp. 1]``): regla pura, una sola para todas las familias.

Un dataset cuyo contenido (preguntas, evidencia esperada, orden esperado) lo fijó un asistente de IA y no un oncólogo declara
``revision_provisional: {rol: ia, fecha: AAAA-MM-DD}``. Es una marca de procedencia, no una validación clínica: el informe que
se calcula con ese dataset sigue rotulado ``no_validada``. La forma es exactamente ``rol`` y ``fecha``, el rol de un
conjunto cerrado y la fecha ISO. El catálogo declara la misma forma (``$defs/revisionProvisional`` de ``comun.schema.json``,
l1d-126 parte A, ya en main); los tests comprueban la paridad del conjunto de roles y del patrón de la fecha. Esta es la marca
de los datasets de `evaluate`; no es el modelo Pydantic ``forma_estricta.RevisionProvisional`` que valida el catálogo. Las
familias `diagnostico`, `opciones` y `poblacion` validan con esta función (un solo dueño; la creó l1d-334 y l1d-246 y l1d-299
la reutilizan).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Final

from app.evaluation.dataset_loader import DatasetInvalido

ROTULO_DE_REVISION_PROVISIONAL: Final = "Revisión provisional de IA; sin validación humana"
"""Rótulo legible que acompaña a la marca en los reportes; no cambia ningún veredicto."""
ROLES_DE_REVISION_PROVISIONAL: Final = ("ia",)
"""Rol que firma la revisión provisional; un oncólogo no se declara aquí: su revisión es ``revisada_por_oncologo``."""
PATRON_DE_FECHA_ISO: Final = r"^\d{4}-\d{2}-\d{2}$"
"""Mismo ``pattern`` que ``fecha`` en ``comun.schema.json``; un test de paridad lo comprueba."""


@dataclass(frozen=True)
class MarcaDeRevisionProvisional:
    rol: str
    fecha: str
    """Fecha ISO (``AAAA-MM-DD``)."""


def exigir_revision_provisional(revision: object, donde: str) -> MarcaDeRevisionProvisional:
    """Valida la forma ``{rol, fecha}`` y devuelve la marca; ``DatasetInvalido`` (sin valores) si no la cumple."""
    if not isinstance(revision, dict) or set(revision) != {"rol", "fecha"}:
        raise DatasetInvalido(f"{donde}: revision_provisional debe ser exactamente {{rol, fecha}}")
    if revision["rol"] not in ROLES_DE_REVISION_PROVISIONAL:
        raise DatasetInvalido(
            f"{donde}: revision_provisional.rol debe ser uno de {', '.join(ROLES_DE_REVISION_PROVISIONAL)}"
        )
    return MarcaDeRevisionProvisional(str(revision["rol"]), _fecha_iso(revision["fecha"], donde))


def _fecha_iso(valor: object, donde: str) -> str:
    """YAML convierte una fecha sin comillas en ``date``; también se admite el texto ISO."""
    if isinstance(valor, date):
        return valor.isoformat()
    if isinstance(valor, str) and re.fullmatch(PATRON_DE_FECHA_ISO, valor):
        try:
            return date.fromisoformat(valor).isoformat()
        except ValueError:
            pass
    raise DatasetInvalido(f"{donde}: revision_provisional.fecha debe ser una fecha ISO")
