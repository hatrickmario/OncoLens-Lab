"""Verbalización determinista de un metadato como hipótesis para el NLI (ADR-34).

Plantillas fijas en español, sin lenguaje prescriptivo (RN-23): describen lo que el estudio declara, nunca lo que un
paciente debería recibir. Es la hipótesis que el NLI contrasta con los chunks del documento (RN-25).
"""

from __future__ import annotations

from typing import Final

from app.domain.corpus_metadata.campos import (
    CAMPOS_ESCALARES,
    CRITERIOS_PLANOS,
    DISENOS_EXTRAIBLES,
    SUBCLAVES_DE_BIOMARCADORES,
)

# Cada tabla se indexa desde ``campos.py`` con ``zip(strict=True)``: añadir un diseño, un criterio o una subclave sin su
# plantilla falla al importar, no en producción.
_DISENOS: Final = dict(
    zip(
        DISENOS_EXTRAIBLES,
        (
            "El documento es una guía de práctica clínica",
            "El estudio es un ensayo controlado aleatorizado",
            "El estudio es un estudio observacional",
            "El documento es una revisión sistemática",
        ),
        strict=True,
    )
)
_BIOMARCADORES: Final = dict(
    zip(SUBCLAVES_DE_BIOMARCADORES, ("HER2", "los receptores hormonales", "HRR/BRCA"), strict=True)
)
_ESCALARES_CON_PLANTILLA: Final = tuple(c for c in CAMPOS_ESCALARES if c != "study_design")
_PLANTILLAS: Final = {
    **dict(
        zip(
            _ESCALARES_CON_PLANTILLA,
            (
                "El estudio es un ensayo de fase {valor}",
                "El estudio incluyó {valor} participantes",
                "El criterio de valoración principal del estudio es {valor}",
            ),
            strict=True,
        )
    ),
    **dict(
        zip(
            CRITERIOS_PLANOS,
            (
                "La población del estudio tiene el subtipo {valor}",
                "La población del estudio está en el estadio {valor}",
                "El estudio evalúa el tratamiento en la línea {valor}",
                "La edad de la población del estudio es {valor}",
                "El estado funcional ECOG de la población del estudio es {valor}",
            ),
            strict=True,
        )
    ),
}
_PREFIJO_DE_BIOMARCADOR: Final = "biomarcadores."


class CampoSinVerbalizacion(ValueError):
    """El campo o el valor no tiene plantilla: se trata como un fallo de la extracción, nunca se improvisa una hipótesis."""


def verbalizar_metadato(campo: str, valor: object) -> str:
    """Hipótesis en español para ``campo`` (``study_design``, ``estadio``, ``biomarcadores.her2``, ...) y su ``valor``."""
    if campo == "study_design":
        if valor not in _DISENOS:
            raise CampoSinVerbalizacion(campo)
        return _DISENOS[str(valor)]
    if campo.startswith(_PREFIJO_DE_BIOMARCADOR):
        nombre = _BIOMARCADORES.get(campo.removeprefix(_PREFIJO_DE_BIOMARCADOR))
        if nombre is None:
            raise CampoSinVerbalizacion(campo)
        return f"En la población del estudio, {nombre} es {valor}"
    if campo not in _PLANTILLAS:
        raise CampoSinVerbalizacion(campo)
    return _PLANTILLAS[campo].format(valor=valor)
