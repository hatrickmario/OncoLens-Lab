"""Llamadas salientes de la suite y el recuento de las que van a la nube con datos reales (RN-12, US-072 AC-6).

Es defensa en profundidad: ``exigir_adapters_locales`` y ``exigir_juez_local`` abortan antes de enviar nada; este
recuento mide lo que de verdad salió y su valor esperado es 0.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from app.domain.reglas_proveedor import es_modelo_de_nube, es_proveedor_local
from app.evaluation.dataset_loader import CLASE_SINTETICA


@dataclass(frozen=True)
class LlamadaSaliente:
    destino: str
    clase_datos: str
    modelo: str


@dataclass
class RegistroDeLlamadas:
    llamadas: list[LlamadaSaliente] = field(default_factory=list)

    def registrar(self, destino: str, clase_datos: str, modelo: str) -> None:
        self.llamadas.append(LlamadaSaliente(destino, clase_datos, modelo))


def llamadas_a_nube_con_datos_reales(llamadas: Iterable[LlamadaSaliente]) -> int:
    """Llamadas a un destino fuera de la lista local con datos que no son sintéticos (la nube solo con sintéticos)."""
    return sum(
        (not es_proveedor_local(llamada.destino) or es_modelo_de_nube(llamada.modelo))
        and llamada.clase_datos != CLASE_SINTETICA
        for llamada in llamadas
    )
