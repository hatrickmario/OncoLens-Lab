"""Arnés de `/chat/turn` (US-259): el `ChatTurnService` REAL con sus bordes falsos y un cliente HTTP.

El LLM es ``FakeChatLlm``, el contador de tokens cuenta palabras y el reloj es ``RelojFijo`` (el test lo adelanta). Cada
respuesta se valida contra el spec del proveedor (hook de `verificacion_proveedor.py`, US-214). Solo datos sintéticos.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from typing import Any

from app.application.chat.registro_de_hilos import RegistroDeHilos
from app.application.chat.servicio_de_turno import ChatTurnService
from app.bootstrap import crear_app
from app.infrastructure.catalogo_clinico.sinonimos import cargar_terminos_por_tipo
from app.infrastructure.lenguaje.terminos_prohibidos import cargar_verificador_de_terminos
from fastapi.testclient import TestClient
from tests.support.contador_de_tokens_falso import ContadorPorPalabras
from tests.support.contract import CATALOGOS
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.llm_chat_falso import FakeChatLlm
from tests.support.recuperacion import EJEMPLOS, VERSION_DEL_CATALOGO_MONTADO, CatalogoClinicoFalso
from tests.support.service_jwt import con_token_valido

Q_CASO = "¿Cuál es la situación actual de la paciente?"
Q_FALTANTES = "¿Qué información falta del caso?"
Q_EVIDENCIA = "¿Qué evidencia existe sobre terapia adyuvante en este subtipo?"
Q_SIN_REGLA = "Necesito ayuda con este caso"
Q_PRESCRIPTIVA = "¿Qué tratamiento debe recibir?"
Q_OTRA_PERSONA = "¿Lo descrito aplica al tratamiento que recibió [NOMBRE]?"
Q_OTRO_CANCER = "¿Qué describe la evidencia sobre cáncer de próstata metastásico?"
Q_PII_SIN_ENMASCARAR = "¿Qué sabemos del paciente con teléfono [TELEFONO]?"

HILO_A = "5b0e7a3c-2f64-4d8a-9c1e-7a4f3b2d1e90"
HILO_B = "a1b2c3d4-0000-4000-8000-000000000002"
HILO_C = "a1b2c3d4-0000-4000-8000-000000000003"

ESTADO_VACIO: dict[str, Any] = {
    "intentsVistos": [],
    "preguntasPrevias": [],
    "opcionesMostradas": [],
    "citasMostradas": [],
    "faltantesSenalados": [],
}
DEL_EJEMPLO = object()
REHIDRATACION_VACIA: dict[str, Any] = {"turns": [], "structuredState": ESTADO_VACIO}


@dataclass
class EntornoDeChat:
    cliente: TestClient
    llm: FakeChatLlm
    contador: ContadorPorPalabras
    reloj: RelojFijo
    catalogo: CatalogoClinicoFalso
    registro: RegistroDeHilos

    def turno(self, solicitud: dict[str, Any]):
        return self.cliente.post("/chat/turn", json=solicitud)

    def estado_del_hilo(self, thread_id: str) -> dict[str, Any] | None:
        """Los valores del último punto de control del hilo en memoria; solo para pruebas (AC-8, limpieza del turno)."""
        ultimo = self.registro.guardado.get_tuple(self.registro.configuracion(thread_id))
        return None if ultimo is None else dict(ultimo.checkpoint["channel_values"])

    def llamadas_a_adapters(self) -> dict[str, int]:
        """Las invocaciones de los bordes que el turno no debe tocar antes de entrar al grafo."""
        return {"llm": self.llm.invocaciones, "contador": self.contador.consultas}


def solicitud_de_turno(
    pregunta: str = Q_CASO,
    *,
    hilo: str = HILO_A,
    rehidratacion: dict[str, Any] | None | object = DEL_EJEMPLO,
    version_del_catalogo: str = VERSION_DEL_CATALOGO_MONTADO,
) -> dict[str, Any]:
    """El ejemplo ``chat-turn-request.json`` del contrato con otra pregunta, hilo, catálogo y rehidratación.

    Por defecto conserva TAL CUAL la ``rehydration`` del ejemplo (el PRIMER turno de un hilo: vacía, como exige el
    contrato); ``None`` la quita (turno de un hilo vivo) y un dict la reemplaza."""
    ejemplo = json.loads((EJEMPLOS / "chat-turn-request.json").read_text(encoding="utf-8"))
    solicitud = copy.deepcopy(ejemplo)
    solicitud["threadId"] = hilo
    solicitud["question"] = pregunta
    solicitud["catalogVersion"] = version_del_catalogo
    if rehidratacion is None:
        solicitud.pop("rehydration", None)
    elif rehidratacion is not DEL_EJEMPLO:
        solicitud["rehydration"] = copy.deepcopy(rehidratacion)
    return solicitud


def solicitud_desde_ejemplo(nombre: str) -> dict[str, Any]:
    """Un ejemplo ``chat-turn-request*.json`` TAL CUAL; solo se cambia ``catalogVersion`` por el del catálogo montado."""
    solicitud = json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))
    solicitud["catalogVersion"] = VERSION_DEL_CATALOGO_MONTADO
    return solicitud


def crear_entorno_de_chat(
    escenario: str = "CHAT-OK", *, llm: FakeChatLlm | None = None, **cambios_de_settings: object
) -> EntornoDeChat:
    llm = llm or FakeChatLlm(escenario)
    contador = ContadorPorPalabras()
    reloj = RelojFijo()
    catalogo = CatalogoClinicoFalso()
    settings = settings_de_prueba(**cambios_de_settings)
    servicio = ChatTurnService(
        llm=llm,
        catalogo=catalogo,
        contador=contador,
        reloj=reloj,
        settings=settings,
        terminos_por_tipo=cargar_terminos_por_tipo(CATALOGOS, settings.enabled_cancer_types),
        verificador_terminos=cargar_verificador_de_terminos(CATALOGOS),
    )
    app = crear_app(
        settings_de_prueba(**cambios_de_settings),
        trace_ids=GeneradorTraceFijo(),
        clock=RelojFijo(),  # el verificador del JWT de servicio no avanza con el reloj del hilo
        chat=servicio,
    )
    cliente = TestClient(
        app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion())
    )
    return EntornoDeChat(cliente, llm, contador, reloj, catalogo, servicio.registro)
