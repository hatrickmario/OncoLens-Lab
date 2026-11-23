"""Marca ``revision_provisional`` de los datasets de `evaluate` (``[S7 resp. 1]``): regla pura, una sola para todas las familias.

Un dataset cuyo contenido (preguntas, evidencia esperada, orden esperado) lo fijó un asistente de IA y no un oncólogo declara
``revision_provisional: {rol: ia, fecha: AAAA-MM-DD}``. Es una marca de procedencia, no una validación clínica: el informe que
se calcula con ese dataset sigue rotulado ``no_validada``. La forma es exactamente ``rol`` y ``fecha``, el rol de un
conjunto cerrado y la fecha ISO. Estará en el catálogo (``$defs/revisionProvisional``, l1d-126 parte A); hoy esta es la
única definición (hay una nota en el design.md de l1d-334 para añadir un test de paridad cuando l1d-126 A llegue a main). Las familias `diagnostico`, `opciones` y `poblacion` validan con esta función (un solo dueño; la
creó l1d-334 y l1d-246 y l1d-299 la reutilizan).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Final

from app.evaluation.dataset_loader import DatasetInvalido

ROTULO_DE_REVISION_PROVISIONAL: Final = "Revisión provisional de IA; sin validación humana"
"""Rótulo legible que acompaña a la marca en los reportes; no cambia ningún veredicto."""
ROLES_DE_REVISION_PROVISIONAL: Final = ("ia",)
"""Rol que firma la revisión provisional; un oncólogo no se declara aquí: su revisión es ``revisada_por_oncologo``."""


@dataclass(frozen=True)
class RevisionProvisional:
    rol: str
    fecha: str
    """Fecha ISO (``AAAA-MM-DD``)."""


def exigir_revision_provisional(revision: object, donde: str) -> RevisionProvisional:
    """Valida la forma ``{rol, fecha}`` y devuelve la marca; ``DatasetInvalido`` (sin valores) si no la cumple."""
    if not isinstance(revision, dict) or set(revision) != {"rol", "fecha"}:
        raise DatasetInvalido(f"{donde}: revision_provisional debe ser exactamente {{rol, fecha}}")
    if revision["rol"] not in ROLES_DE_REVISION_PROVISIONAL:
        raise DatasetInvalido(
            f"{donde}: revision_provisional.rol debe ser uno de {', '.join(ROLES_DE_REVISION_PROVISIONAL)}"
        )
    return RevisionProvisional(str(revision["rol"]), _fecha_iso(revision["fecha"], donde))


def _fecha_iso(valor: object, donde: str) -> str:
    """YAML convierte una fecha sin comillas en ``date``; también se admite el texto ISO."""
    if isinstance(valor, date):
        return valor.isoformat()
    if isinstance(valor, str):
        try:
            return date.fromisoformat(valor).isoformat()
        except ValueError:
            pass
    raise DatasetInvalido(f"{donde}: revision_provisional.fecha debe ser una fecha ISO")
