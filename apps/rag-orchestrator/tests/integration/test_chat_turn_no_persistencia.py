"""`POST /chat/turn` (US-259 AC-8): nada del paciente persiste en Backend 2 (RN-10, RN-11, ADR-51).

Cinco turnos con PII sembrada en la pregunta (llamada directa, sin el enmascarado de Backend 1). Se comprueba que no
quedan ficheros ni en el directorio de trabajo ni en el de temporales, que el turno no abre ninguna conexión (ni a
PostgreSQL `corpus` ni a Milvus: toda conexión de socket falla), que los logs no llevan el texto de ninguna pregunta y que
el estado del hilo no tiene `patientId` ni `pseudoPatientId`. Los tests de *permission denied* del rol `rag_corpus`
siguen en `tests/integration/permisos/`.
"""

import logging
import socket
import tempfile
from datetime import timedelta
from pathlib import Path

import pytest

from tests.support.chat import (
    HILO_A,
    REHIDRATACION_VACIA,
    crear_entorno_de_chat,
    solicitud_de_turno,
)

PREGUNTAS_CON_PII = (
    "¿Qué sabemos de Ana Gómez con documento 1020304050?",
    "¿Cuál es el resumen de Ana Gómez, teléfono 3001234567?",
    "¿Qué información falta de Ana Gómez, correo ana.gomez@ejemplo.org?",
    "¿Qué evidencia existe para Ana Gómez nacida el 14/03/1971?",
    "¿Qué fuentes respaldan lo dicho sobre Ana Gómez?",
)
CLAVES_PROHIBIDAS = ("patientid", "pseudopatientid", "patient_id", "pseudo_patient_id")


def _sin_conexiones(*_args, **_kwargs):
    raise AssertionError("el turno abrió una conexión de red (corpus, Milvus u otro)")


def _claves(valor, acumuladas: set[str]) -> set[str]:
    if isinstance(valor, dict):
        for clave, contenido in valor.items():
            acumuladas.add(str(clave).lower())
            _claves(contenido, acumuladas)
    elif isinstance(valor, (list, tuple, set)):
        for contenido in valor:
            _claves(contenido, acumuladas)
    elif hasattr(valor, "__dict__"):
        _claves(vars(valor), acumuladas)
    return acumuladas


@pytest.mark.ac("US-259", 8)
def test_chat_turn_no_deja_ficheros_conexiones_logs_ni_ids_del_paciente_cuando_termina_una_conversacion_de_cinco_turnos(
    tmp_path, monkeypatch, caplog
):
    trabajo, temporales = tmp_path / "trabajo", tmp_path / "temporales"
    trabajo.mkdir()
    temporales.mkdir()
    monkeypatch.chdir(trabajo)
    monkeypatch.setattr(tempfile, "tempdir", str(temporales))
    monkeypatch.setattr(socket.socket, "connect", _sin_conexiones)
    monkeypatch.setattr(socket, "create_connection", _sin_conexiones)
    caplog.set_level(logging.DEBUG)
    entorno = crear_entorno_de_chat("CHAT-OK")
    solicitud_base = solicitud_de_turno(PREGUNTAS_CON_PII[0])
    pseudo_id = solicitud_base["pseudoPatientId"]

    for indice, pregunta in enumerate(PREGUNTAS_CON_PII):
        solicitud = solicitud_de_turno(
            pregunta, rehidratacion=REHIDRATACION_VACIA if indice == 0 else None
        )
        assert entorno.turno(solicitud).status_code == 200
        entorno.reloj.valor += timedelta(seconds=1)

    assert list(trabajo.rglob("*")) == [] and list(temporales.rglob("*")) == []
    assert Path.cwd() == trabajo
    for pregunta in PREGUNTAS_CON_PII:
        assert pregunta not in caplog.text
    for fragmento in ("Ana Gómez", "1020304050", "3001234567", "ana.gomez@ejemplo.org"):
        assert fragmento not in caplog.text
    estado_del_hilo = entorno.registro.estado_para_inspeccion(HILO_A)
    assert estado_del_hilo, "el hilo debería seguir vivo en memoria"
    assert not (set(CLAVES_PROHIBIDAS) & _claves(estado_del_hilo, set()))
    assert pseudo_id not in repr(estado_del_hilo)
