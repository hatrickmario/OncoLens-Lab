"""Verbalización determinista de un metadato como hipótesis para el NLI (ADR-34).

Plantillas fijas en español, sin lenguaje prescriptivo (RN-23): describen lo que el estudio declara, nunca lo que un
paciente debería recibir. Es la hipótesis que el NLI contrasta con los chunks del documento (RN-25).
"""

from __future__ import annotations

from typing import Final

_DISENOS: Final = {
    "guia": "El documento es una guía de práctica clínica",
    "eca": "El estudio es un ensayo controlado aleatorizado",
    "observacional": "El estudio es un estudio observacional",
    "revision_sistematica": "El documento es una revisión sistemática",
}
_BIOMARCADORES: Final = {
    "her2": "HER2",
    "receptores_hormonales": "los receptores hormonales",
    "hrr_brca": "HRR/BRCA",
}
_PLANTILLAS: Final = {
    "trial_phase": "El estudio es un ensayo de fase {valor}",
    "sample_size": "El estudio incluyó {valor} participantes",
    "primary_endpoint": "El criterio de valoración principal del estudio es {valor}",
    "subtipo": "La población del estudio tiene el subtipo {valor}",
    "estadio": "La población del estudio está en el estadio {valor}",
    "linea": "El estudio evalúa el tratamiento en la línea {valor}",
    "edad": "La edad de la población del estudio es {valor}",
    "ecog": "El estado funcional ECOG de la población del estudio es {valor}",
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
