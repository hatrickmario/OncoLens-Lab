"""Gate 2 de L1D-316 (diseño): admisión de turnos, limpieza del turno fallido, puntos de extensión del grafo y paridad del
fake de `LLM_PROVIDER=fake` con el servicio real."""

from datetime import timedelta
from pathlib import Path

import pytest
import yaml
from langgraph.checkpoint.memory import InMemorySaver

from app.application.chat.grafo import ConfiguracionDelGrafo, construir_grafo
from app.application.chat.registro_de_hilos import RegistroDeHilos
from app.application.errores import HiloDesconocidoError
from app.application.ports import FalloDelLlm
from app.domain.chat.estado import INTENCIONES_CLASIFICABLES, MAX_TURNOS_EN_MEMORIA, Intencion
from app.domain.chat.turno import HechoDelCaso, PropuestaDelTurno
from app.infrastructure.fake.fake_chat_turn import FakeChatTurn
from app.schemas.generated.models import ChatTurnRequest, ChatTurnResponse
from tests.support.chat import (
    HILO_A,
    HILO_B,
    HILO_C,
    Q_CASO,
    Q_FALTANTES,
    crear_entorno_de_chat,
    solicitud_de_turno,
)
from tests.support.contador_de_tokens_falso import ContadorPorPalabras
from tests.support.fakes import RelojFijo
from tests.support.llm_chat_falso import FakeChatLlm
from tests.support.recuperacion import EJEMPLOS

pytestmark = pytest.mark.anyio


def _sin_hilo(pregunta: str, hilo: str) -> dict:
    return solicitud_de_turno(pregunta, hilo=hilo, rehidratacion=None)


def test_un_turno_rechazado_con_404_no_desaloja_hilos_vivos_cuando_el_registro_esta_lleno():
    entorno = crear_entorno_de_chat("CHAT-OK", chat_max_threads=2)
    for hilo in (HILO_A, HILO_B):
        assert entorno.turno(solicitud_de_turno(Q_CASO, hilo=hilo)).status_code == 200

    assert entorno.turno(_sin_hilo(Q_FALTANTES, HILO_C)).status_code == 404

    assert entorno.turno(_sin_hilo(Q_FALTANTES, HILO_A)).status_code == 200
    assert entorno.turno(_sin_hilo(Q_FALTANTES, HILO_B)).status_code == 200


def test_un_turno_fallido_no_deja_la_pregunta_ni_los_hechos_en_un_hilo_existente_cuando_el_llm_cae():
    entorno = crear_entorno_de_chat("CHAT-OK")
    assert entorno.turno(solicitud_de_turno(Q_CASO)).status_code == 200
    entorno.llm.error = FalloDelLlm()

    fallido = entorno.turno(_sin_hilo("¿Cuál es el resumen del paciente en este momento?", HILO_A))

    assert fallido.status_code == 503
    estado = entorno.estado_del_hilo(HILO_A)
    assert estado is not None
    assert not estado["pregunta"] and not estado["hechos"] and not estado.get("propuestas")
    assert "resumen del paciente en este momento" not in repr(estado)
    entorno.llm.error = None
    assert entorno.turno(_sin_hilo(Q_FALTANTES, HILO_A)).status_code == 200


def test_un_hilo_nuevo_cuyo_primer_turno_falla_se_olvida_cuando_el_llm_cae():
    entorno = crear_entorno_de_chat("CHAT-OK", llm=FakeChatLlm("CHAT-OK", error=FalloDelLlm()))

    assert entorno.turno(solicitud_de_turno(Q_CASO)).status_code == 503

    assert entorno.estado_del_hilo(HILO_A) is None
    assert entorno.turno(_sin_hilo(Q_FALTANTES, HILO_A)).status_code == 404


class _Capacidad:
    def __init__(self, texto: str) -> None:
        self.texto = texto
        self.llamadas = 0

    async def __call__(self, estado):
        self.llamadas += 1
        return {"propuestas": (PropuestaDelTurno(self.texto, ("f1",)),)}


def _hechos() -> tuple[HechoDelCaso, ...]:
    return (HechoDelCaso("f1", "Hecho de prueba", 0, "verificado"),)


async def test_el_grafo_usa_la_capacidad_inyectada_en_lugar_del_esqueleto_cuando_se_pasa_capacidades():
    caso = _Capacidad("Respuesta del nodo caso inyectado.")
    llm = FakeChatLlm("CHAT-OK")
    grafo = construir_grafo(
        llm=llm,
        contador=ContadorPorPalabras(),
        configuracion=ConfiguracionDelGrafo(1500, {}, {}),
        verificador_terminos=_verificador(),
        guardado=InMemorySaver(),
        capacidades={Intencion.caso: caso},
    )

    final = await grafo.ainvoke(
        {
            "pregunta": Q_CASO,
            "hechos": _hechos(),
            "tipo_del_contexto": "mama",
            "clasificacion_de_datos": "sintetico",
            "trace_id": "req_00000001",
        },
        {"configurable": {"thread_id": "t"}},
    )

    assert caso.llamadas == 1 and llm.llamadas_de_generacion == 0
    assert [b.texto for b in final["bloques"]] == ["Respuesta del nodo caso inyectado."]


def test_el_esqueleto_por_defecto_cubre_toda_intencion_clasificable_cuando_no_se_pasa_capacidades():
    from app.application.chat.grafo import capacidades_por_defecto

    capacidades = capacidades_por_defecto(
        FakeChatLlm("CHAT-OK"), ContadorPorPalabras(), ConfiguracionDelGrafo(1500, {}, {})
    )

    assert set(capacidades) == set(INTENCIONES_CLASIFICABLES)


def _verificador():
    from app.infrastructure.lenguaje.terminos_prohibidos import cargar_verificador_de_terminos
    from tests.support.contract import CATALOGOS

    return cargar_verificador_de_terminos(CATALOGOS)


async def test_el_fake_del_chat_lanza_hilo_desconocido_como_el_servicio_real_cuando_el_hilo_no_existe():
    respuesta = ChatTurnResponse.model_validate_json(
        (EJEMPLOS / "chat-turn-caso-ok.json").read_text(encoding="utf-8")
    )
    fake = FakeChatTurn(
        respuesta,
        RegistroDeHilos(reloj=RelojFijo(), ttl_segundos=60, max_hilos=2),
    )
    sin_rehidratacion = ChatTurnRequest.model_validate(_sin_hilo(Q_CASO, HILO_A))
    con_rehidratacion = ChatTurnRequest.model_validate(solicitud_de_turno(Q_CASO, hilo=HILO_A))

    with pytest.raises(HiloDesconocidoError):
        await fake.turno(sin_rehidratacion)
    assert await fake.turno(con_rehidratacion) == respuesta
    assert await fake.turno(sin_rehidratacion) == respuesta  # el hilo ya existe


def test_el_registro_vence_los_hilos_del_fake_con_el_mismo_reloj_inyectado():
    reloj = RelojFijo()
    registro = RegistroDeHilos(reloj=reloj, ttl_segundos=60, max_hilos=2)
    registro.admitir_turno(HILO_A, con_rehidratacion=True)
    reloj.valor += timedelta(seconds=61)

    with pytest.raises(HiloDesconocidoError):
        registro.admitir_turno(HILO_A, con_rehidratacion=False)


def test_el_contrato_es_el_dueno_del_tope_de_turnos_de_la_rehidratacion_cuando_se_lee_el_openapi():
    spec = yaml.safe_load(
        (Path(__file__).resolve().parents[2] / "openapi.yaml").read_text(encoding="utf-8")
    )

    tope = spec["components"]["schemas"]["ChatRehydration"]["properties"]["turns"]["maxItems"]

    assert tope == MAX_TURNOS_EN_MEMORIA
