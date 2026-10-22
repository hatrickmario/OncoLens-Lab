"""Privacidad (US-072 AC-6, G-8, RN-12): sensibilidad del detector de B1 y llamadas a la nube con datos reales.

Solo conteos y banderas: nada de los textos sembrados ni de las notas del informe llega al reporte (RN-14).
"""

from __future__ import annotations

import dataclasses
from collections.abc import Iterable
from typing import Any

from app.evaluation.informe_pii import InformePiiB1
from app.evaluation.llamadas import LlamadaSaliente, llamadas_a_nube_con_datos_reales


def privacidad(
    textos_sembrados: int, informe_b1: InformePiiB1 | None, llamadas: Iterable[LlamadaSaliente]
) -> dict[str, Any]:
    """Sin informe de B1 la sensibilidad queda «sin medir» (clave ausente), nunca en cero."""
    bloque: dict[str, Any] = {
        "textos_sembrados": textos_sembrados,
        "llamadas_nube_datos_reales": llamadas_a_nube_con_datos_reales(llamadas),
        "sensibilidad_b1_medida": informe_b1 is not None,
    }
    if informe_b1 is not None:
        bloque["sensibilidad_b1"] = {
            "textos_medidos": informe_b1.textos,
            **{modo: dataclasses.asdict(m) for modo, m in informe_b1.modos.items()},
        }
    return bloque
