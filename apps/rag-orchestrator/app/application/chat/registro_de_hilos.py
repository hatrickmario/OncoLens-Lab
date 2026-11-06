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
    ENTRADAS_DEL_TURNO_VACIAS,
    EstadoDelHilo,
    EstadoEstructurado,
    Intencion,
    TurnoPrevio,
    UltimaEvidencia,
)
from app.domain.chat.turno import BloqueDelTurno, HechoDelCaso, PropuestaDelTurno, TipoDeBloque
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
    TipoDeBloque,
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

    def admitir_turno(self, thread_id: str, *, con_rehidratacion: bool) -> bool:
        """Decide si un turno entra y deja el registro listo para él. Es la ÚNICA puerta de entrada de los turnos (el
        servicio real y el fake de ``LLM_PROVIDER=fake`` pasan por aquí) y hace, en este orden:

        1. **Purga** los hilos cuya última actividad superó el TTL (perezosa, con el reloj inyectado).
        2. Rechaza con ``HiloDesconocidoError`` un hilo ausente sin ``rehydration``: no cambia nada más, en particular
           **no desaloja** ningún hilo vivo.
        3. Si el hilo es nuevo (hay ``rehydration``), **desaloja** los de actividad más antigua hasta dejarle lugar
           (``CHAT_MAX_THREADS``).
        4. **Renueva** la actividad del hilo (el TTL es deslizante) y lo pone como el más reciente.

        Devuelve ``True`` si el hilo se crea ahora y hay que sembrarlo con la ``rehydration``; ``False`` si ya estaba vivo
        (su estado manda y la ``rehydration`` se ignora)."""
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
        for hilo in [
            h
            for h, ultima in self._actividad.items()
            if hilo_vencido(ultima, ahora, self._ttl_segundos)
        ]:
            self.olvidar(hilo)

    def _desalojar_hasta_dejar_lugar(self) -> None:
        while len(self._actividad) >= self._max_hilos:
            mas_antiguo = next(iter(self._actividad))
            self.olvidar(mas_antiguo)

    def olvidar(self, thread_id: str) -> None:
        """Descarta el hilo (p. ej. si su primer turno falló): el siguiente turno debe traer ``rehydration``."""
        self._actividad.pop(thread_id, None)
        self.guardado.delete_thread(thread_id)

    @staticmethod
    def configuracion(thread_id: str) -> dict[str, Any]:
        return {"configurable": {"thread_id": thread_id}}

    def compactar(self, thread_id: str) -> None:
        """Deja solo el último punto de control del hilo y le vacía las entradas del turno.

        ``InMemorySaver`` guarda un punto por paso y crecería sin límite; y si el turno falló, el punto de control de
        entrada conserva la pregunta y los hechos del turno, que no deben sobrevivirle (RN-10, RN-11)."""
        ultimo = self.guardado.get_tuple(self.configuracion(thread_id))
        if ultimo is None:
            return
        checkpoint = {
            **ultimo.checkpoint,
            "channel_values": {**ultimo.checkpoint["channel_values"], **ENTRADAS_DEL_TURNO_VACIAS},
        }
        self.guardado.delete_thread(thread_id)
        self.guardado.put(
            {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}},
            checkpoint,
            ultimo.metadata,
            checkpoint["channel_versions"],
        )
