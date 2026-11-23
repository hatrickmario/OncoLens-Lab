"""Reporte base de la familia `contextual` (US-273 AC-2, `[S7 resp. 10]`): lectura y comparación con la corrida actual.

Solo se compara con un reporte de la misma familia sobre el mismo dataset y el mismo corpus (nombre, versión, release y
recuento de chunks); si no coinciden, la corrida termina con error antes de escribir nada. Se lee lo mínimo (el corpus y los
recuentos por clase): lo que no está o no tiene la forma esperada es una configuración inválida. Los mensajes nunca llevan
la ruta ni el contenido del reporte (RN-14).
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.evaluation.config_suite import ConfigInvalida
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.metricas.contextual import RecuentoDeClase

IDENTIDAD_DEL_CORPUS = ("dataset", "corpus")


@dataclass(frozen=True)
class ReporteBase:
    nombre: str
    hash_config: str
    identidad_del_corpus: Mapping[str, Any]
    recuentos: tuple[RecuentoDeClase, ...]


def leer_reporte_base(ruta: Path) -> ReporteBase:
    try:
        crudo = json.loads(ruta.read_text(encoding="utf-8"))
        configuracion = crudo["configuracion"]
        return ReporteBase(
            str(configuracion["nombre"]),
            str(configuracion["hashConfig"]),
            {clave: configuracion[clave] for clave in IDENTIDAD_DEL_CORPUS},
            tuple(
                RecuentoDeClase(
                    str(r["ambito"]), str(r["clase"]), int(r["con_evidencia"]), int(r["total"])
                )
                for r in crudo["recuentos"]
            ),
        )
    except (OSError, ValueError, KeyError, TypeError):
        raise ConfigInvalida(
            "contextual.reporte_base no es un reporte de la familia contextual legible"
        ) from None


def exigir_mismo_corpus(configuracion: Mapping[str, Any], base: ReporteBase) -> None:
    actual = {clave: configuracion[clave] for clave in IDENTIDAD_DEL_CORPUS}
    if actual != dict(base.identidad_del_corpus):
        raise SuiteAbortada(
            "el reporte base se corrió con otro dataset o corpus: no se comparan (S7 resp. 10)"
        )
