"""`RegistroDeHilos`: estado efímero de los hilos del chat en memoria del proceso (US-259, ADR-51, design D2).

Envuelve un ``InMemorySaver`` de LangGraph (el estado del grafo por ``thread_id``) y recuerda la última actividad de cada
hilo. Nada se escribe en disco, en ``corpus`` ni en Milvus: al reiniciar el proceso el estado desaparece y Backend 1
rehidrata. El ``thread_id`` es un UUID aleatorio de la conversación, nunca el ``patientId`` ni el ``pseudoPatientId``.
"""

from __future__ import annotations

from collections import OrderedDict
from datetime import datetime
from typing import Any

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

from app.application.errores import HiloDesconocidoError
from app.application.ports import Clock
from app.domain.chat.estado import (
    EstadoDelHilo,
    EstadoEstructurado,
    Intencion,
    TurnoPrevio,
    UltimaEvidencia,
)
from app.domain.chat.turno import BloqueDelTurno, HechoDelCaso, PropuestaDelTurno
from app.domain.chat.vigencia import hilo_vencido


TIPOS_DEL_ESTADO = (
    EstadoDelHilo,
    EstadoEstructurado,
    UltimaEvidencia,
    TurnoPrevio,
    Intencion,
    HechoDelCaso,
    PropuestaDelTurno,
    BloqueDelTurno,
)
"""Los únicos tipos que viajan en el estado del grafo: el serializador de LangGraph solo reconstruye estos (lista cerrada)."""


class RegistroDeHilos:
    def __init__(self, *, reloj: Clock, ttl_segundos: int, max_hilos: int) -> None:
        self.guardado = InMemorySaver(
            serde=JsonPlusSerializer(
                allowed_msgpack_modules=[(t.__module__, t.__qualname__) for t in TIPOS_DEL_ESTADO]
            )
        )
        self._reloj = reloj
        self._ttl_segundos = ttl_segundos
        self._max_hilos = max_hilos
        self._actividad: OrderedDict[str, datetime] = OrderedDict()

    def abrir(self, thread_id: str, *, con_rehidratacion: bool) -> bool:
        """Registra actividad en el hilo. ``True`` si el hilo se crea ahora (hay que sembrarlo con la ``rehydration``).

        Un hilo ausente sin ``rehydration`` lanza ``HiloDesconocidoError`` antes de entrar al grafo."""
        ahora = self._reloj.ahora()
        self._purgar_vencidos(ahora)
        es_nuevo = thread_id not in self._actividad
        if es_nuevo and not con_rehidratacion:
            raise HiloDesconocidoError()
        if es_nuevo:
            self._desalojar_hasta_dejar_lugar()
        self._actividad[thread_id] = ahora
        self._actividad.move_to_end(thread_id)
        return es_nuevo

    def _purgar_vencidos(self, ahora: datetime) -> None:
        """Purga perezosa (sin tarea en segundo plano): en cada turno se descartan los hilos sin actividad dentro del TTL."""
        for hilo in [
            h
            for h, ultima in self._actividad.items()
            if hilo_vencido(ultima, ahora, self._ttl_segundos)
        ]:
            self.olvidar(hilo)

    def _desalojar_hasta_dejar_lugar(self) -> None:
        """Al crear un hilo con el registro lleno se desaloja el de actividad más antigua, con su estado."""
        while len(self._actividad) >= self._max_hilos:
            mas_antiguo = next(iter(self._actividad))
            self.olvidar(mas_antiguo)

    def admitir_turno(self, thread_id: str, *, con_rehidratacion: bool) -> bool:
        raise NotImplementedError("no implementado")

    def olvidar(self, thread_id: str) -> None:
        """Descarta el hilo (p. ej. si su primer turno falló): el siguiente turno debe traer ``rehydration``."""
        self._actividad.pop(thread_id, None)
        self.guardado.delete_thread(thread_id)

    @staticmethod
    def configuracion(thread_id: str) -> dict[str, Any]:
        return {"configurable": {"thread_id": thread_id}}

    def compactar(self, thread_id: str) -> None:
        """Deja solo el último punto de control del hilo: ``InMemorySaver`` guarda uno por paso y crecería sin límite."""
        ultimo = self.guardado.get_tuple(self.configuracion(thread_id))
        if ultimo is None:
            return
        self.guardado.delete_thread(thread_id)
        self.guardado.put(
            {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}},
            ultimo.checkpoint,
            ultimo.metadata,
            ultimo.checkpoint["channel_versions"],
        )

    def estado_para_inspeccion(self, thread_id: str) -> dict[str, Any] | None:
        """Los valores del último punto de control del hilo; solo para las pruebas de no persistencia (AC-8)."""
        ultimo = self.guardado.get_tuple(self.configuracion(thread_id))
        return None if ultimo is None else dict(ultimo.checkpoint["channel_values"])
