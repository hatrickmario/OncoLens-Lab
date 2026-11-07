"""Medición del tamaño del prompt de evidencia (L1D-322): el evento lleva solo números, nunca texto (RN-10, RN-14)."""

import logging

from app.application.medicion_de_prompt import registrar_tamano_del_prompt
from app.application.prompt_builder import PromptBuilder
from tests.support.contador_de_tokens_falso import ContadorPorPalabras

PREGUNTA = "pregunta secreta del oncólogo"
MEMORIA = "turno previo confidencial"
FRAGMENTO = "texto del fragmento recuperado"


def test_el_evento_separa_los_tokens_de_sistema_datos_y_memoria_y_no_trae_ningun_texto(caplog):
    prompt = (
        PromptBuilder("instrucciones del sistema", "v")
        .pregunta(PREGUNTA)
        .memoria(MEMORIA)
        .documento("C1", FRAGMENTO)
        .construir()
    )
    caplog.set_level(logging.INFO)

    registrar_tamano_del_prompt("seguimiento", "req_x", prompt, 1, ContadorPorPalabras(), 8192)

    (registro,) = [r for r in caplog.records if "chat_evidencia_prompt" in r.getMessage()]
    mensaje = registro.getMessage()
    for campo in ("traceId=req_x", "fase=seguimiento", "fragmentos=1", "numCtx=8192"):
        assert campo in mensaje
    assert "tokensSistema=3" in mensaje and "tokensMemoria=" in mensaje
    total = int(mensaje.split("tokensTotal=")[1].split()[0])
    partes = [
        int(mensaje.split(f"{k}=")[1].split()[0])
        for k in ("tokensSistema", "tokensDatos", "tokensMemoria")
    ]
    assert total == sum(partes) and partes[2] > 0
    for texto in (PREGUNTA, MEMORIA, FRAGMENTO, "instrucciones"):
        assert texto not in caplog.text
