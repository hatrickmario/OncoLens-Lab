"""Modales normativos que una afirmación atómica no puede contener (US-245, OUT-08, D-a).

Recurso versionado propio, junto a la política de lenguaje y sin reabrir ``terminos-prohibidos.json``: los modales que
ya están en esa lista (p. ej. «se debe», «debería recibir») se retiran antes con ``lenguaje_no_permitido`` y nunca
llegan aquí. Las secuencias van normalizadas (sin acentos, en minúsculas); se comparan palabra completa a palabra
completa.
"""

from __future__ import annotations

VERSION_DE_MODALES_NORMATIVOS = "1.1.0"

MODALES_NORMATIVOS: tuple[tuple[str, ...], ...] = (
    ("debe",),
    ("debes",),
    ("deba",),
    ("debiera",),
    ("deben",),
    ("debera",),
    ("deberan",),
    ("deberia",),
    ("deberian",),
    ("conviene",),
    ("convendria",),
    ("hay", "que"),
    ("hace", "falta"),
    ("habria", "que"),
    ("tiene", "que"),
    ("tienen", "que"),
    ("es", "necesario"),
    ("es", "preferible"),
    ("es", "aconsejable"),
    ("should",),
    ("must",),
    ("ought", "to"),
    ("need", "to"),
    ("needs", "to"),
    ("has", "to"),
    ("have", "to"),
)
