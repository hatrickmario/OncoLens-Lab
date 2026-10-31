"""Llamadas salientes de la suite y el recuento de las que van a la nube con datos reales (RN-12, US-072 AC-6).

Es defensa en profundidad: ``exigir_adapters_locales`` y ``exigir_juez_local`` abortan antes de enviar nada; este
recuento mide lo que de verdad salió y su valor esperado es 0. Cubre a TODOS los adapters (US-233a AC-3): los que
hablan HTTP registran su destino; los de ONNX, que corren en el proceso, se registran como ``en_proceso``.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from app.domain.reglas_proveedor import es_modelo_de_nube, es_proveedor_local
from app.evaluation.dataset_loader import CLASE_SINTETICA

DESTINO_EN_PROCESO = "en-proceso"


@dataclass(frozen=True)
class LlamadaSaliente:
    destino: str
    clase_datos: str
    modelo: str
    adaptador: str = ""
    """Etiqueta del adapter que llamó (``embeddings``, ``reranker``, ``nli``, ``llm``, ``juez``); vacía si no se dijo."""


@dataclass
class RegistroDeLlamadas:
    llamadas: list[LlamadaSaliente] = field(default_factory=list)

    def registrar(self, destino: str, clase_datos: str, modelo: str, adaptador: str = "") -> None:
        self.llamadas.append(LlamadaSaliente(destino, clase_datos, modelo, adaptador))

    def registrar_en_proceso(self, adaptador: str, clase_datos: str, modelo: str) -> None:
        """Un adapter que corre dentro del proceso (ONNX): no abre ningún socket."""
        self.registrar(DESTINO_EN_PROCESO, clase_datos, modelo, adaptador)


def _sale_de_la_maquina(llamada: LlamadaSaliente) -> bool:
    if llamada.destino == DESTINO_EN_PROCESO:
        return False
    return not es_proveedor_local(llamada.destino) or es_modelo_de_nube(llamada.modelo)


def llamadas_a_nube_con_datos_reales(llamadas: Iterable[LlamadaSaliente]) -> int:
    """Llamadas a un destino fuera de la lista local con datos que no son sintéticos (la nube solo con sintéticos)."""
    return sum(
        _sale_de_la_maquina(llamada) and llamada.clase_datos != CLASE_SINTETICA
        for llamada in llamadas
    )


def adaptadores_cubiertos(llamadas: Iterable[LlamadaSaliente]) -> list[str]:
    """Etiquetas de los adapters que registraron al menos una llamada, ordenadas."""
    return sorted({llamada.adaptador for llamada in llamadas if llamada.adaptador})
