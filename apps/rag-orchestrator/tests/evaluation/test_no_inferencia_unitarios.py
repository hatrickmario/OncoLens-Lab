"""Unidades de la métrica de no inferencia (L1D-113 S7.1): veredicto, juez léxico, juez local, familia y esquema del reporte."""

from __future__ import annotations

import asyncio
import json
from contextlib import AsyncExitStack

import httpx
import pytest
import respx

from app.evaluation.config_suite import ConfigJuez
from app.evaluation.dataset_loader import CLASE_SINTETICA
from app.evaluation.esquema_suite import ESQUEMA_SUITE
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.juez_fidelidad import JuezNoDisponible
from app.evaluation.juez_no_inferencia import (
    SISTEMA,
    JuezNoInferenciaConLlm,
    JuezNoInferenciaLexico,
    crear_juez_no_inferencia,
    parsear_veredicto_de_inferencia,
)
from app.evaluation.lenguaje_estricto import VerificadorEstricto
from app.evaluation.llamadas import RegistroDeLlamadas
from app.evaluation.metricas.no_inferencia import no_inferencia
from app.evaluation.metricas.prescriptivas import contar_salidas_con_terminos
from app.evaluation.metricas.resultado import ResultadoNoInferencia
from app.evaluation.reporte import ReporteFueraDeEsquema, validar_esquema_cerrado
from app.infrastructure.lenguaje.terminos_prohibidos import cargar_lista_de_terminos
from app.prompts.rag_query import DESCRIPCION_DEL_FALTANTE
from tests.evaluation.conftest import RAIZ_REPO
from tests.evaluation.test_suite_unitarios import consulta

LOCAL = "http://127.0.0.1:11434/v1"
COMPLETIONS = f"{LOCAL}/chat/completions"
NUBE = "https://api.nube-de-prueba.invalid/v1"


def _config_del_juez(base_url: str | None, proveedor: str = "local") -> ConfigJuez:
    return ConfigJuez(
        proveedor=proveedor,
        modelo="juez@1",
        base_url=base_url,
        temperatura=0.0,
        semilla=7,
        timeout_s=5.0,
        acuerdo_minimo=0.8,
        muestra_minima=1,
    )


def _respuesta(contenido: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": contenido}}]})


def _juzgar_local(contenido: str, texto: str = "t", dato: str = "Ki-67") -> tuple[bool, int]:
    async def _correr() -> tuple[bool, int]:
        async with AsyncExitStack() as pila:
            juez = await crear_juez_no_inferencia(
                _config_del_juez(LOCAL), pila, RegistroDeLlamadas(), CLASE_SINTETICA
            )
            assert isinstance(juez, JuezNoInferenciaConLlm)
            atribuye = await juez.atribuye_valor(texto, dato)
            return atribuye, juez.veredictos_invalidos

    with respx.mock() as http:
        http.post(COMPLETIONS).mock(return_value=_respuesta(contenido))
        return asyncio.run(_correr())


# --- el veredicto -----------------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("contenido", "atribuye", "valido"),
    [
        ('{"veredicto": "atribuye_valor"}', True, True),
        ('{"veredicto": "sin_valor"}', False, True),
        ("esto no es JSON", False, False),
        ('["atribuye_valor"]', False, False),
        ('{"veredicto": "quizas"}', False, False),
        ("{}", False, False),
    ],
)
def test_el_veredicto_solo_atribuye_con_la_forma_exacta_y_lo_demas_es_invalido(
    contenido: str, atribuye: bool, valido: bool
) -> None:
    veredicto = parsear_veredicto_de_inferencia(contenido)

    assert (veredicto.atribuye, veredicto.valido) == (atribuye, valido)


def test_el_prompt_del_juez_no_usa_lenguaje_prescriptivo() -> None:
    verificador = VerificadorEstricto(
        cargar_lista_de_terminos(RAIZ_REPO / "packages" / "clinical-catalogs")
    )

    assert contar_salidas_con_terminos([("rationale", SISTEMA)], verificador) == 0


# --- el juez léxico de la CI ------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("texto", "dato", "esperado"),
    [
        ("El Ki-67 de la paciente es del 30 %.", "Ki-67", True),
        ("ki 67 elevado en la paciente", "Ki-67", True),
        (f"Ki-67: {DESCRIPCION_DEL_FALTANTE}", "Ki-67", False),
        ("El estado de HER2 es positivo", "Ki-67", False),
        ("Ki-67 no se describe en este caso", "Ki-67", False),
        ("Estado menopáusico positivo", "Estado menopáusico", True),
    ],
)
def test_el_juez_lexico_atribuye_un_valor_solo_si_nombra_el_dato_con_valor_y_no_lo_da_por_desconocido(
    texto: str, dato: str, esperado: bool
) -> None:
    assert asyncio.run(JuezNoInferenciaLexico().atribuye_valor(texto, dato)) is esperado


# --- el juez local ----------------------------------------------------------------------------------------------------


def test_el_juez_local_cuenta_un_veredicto_invalido_y_no_atribuye_cuando_la_respuesta_no_es_json() -> (
    None
):
    assert _juzgar_local("no es json") == (False, 1)


def test_el_juez_local_atribuye_cuando_responde_atribuye_valor() -> None:
    assert _juzgar_local('{"veredicto": "atribuye_valor"}') == (True, 0)


def test_el_juez_local_envia_un_unico_prompt_acotado_con_el_dato_y_el_texto_y_esquema_estricto() -> (
    None
):
    async def _correr() -> None:
        async with AsyncExitStack() as pila:
            registro = RegistroDeLlamadas()
            juez = await crear_juez_no_inferencia(
                _config_del_juez(LOCAL), pila, registro, CLASE_SINTETICA
            )
            assert juez is not None
            await juez.atribuye_valor("texto de salida", "Ki-67")
            assert [(c.adaptador, c.clase_datos) for c in registro.llamadas] == [
                ("juez", CLASE_SINTETICA)
            ]

    with respx.mock() as http:
        ruta = http.post(COMPLETIONS).mock(return_value=_respuesta('{"veredicto": "sin_valor"}'))
        asyncio.run(_correr())
        cuerpo = json.loads(ruta.calls[0].request.content)

    assert ruta.call_count == 1
    assert "DATO: Ki-67" in cuerpo["messages"][-1]["content"]
    assert "TEXTO: texto de salida" in cuerpo["messages"][-1]["content"]
    assert cuerpo["temperature"] == 0.0
    assert cuerpo["seed"] == 7


@pytest.mark.parametrize(
    "respuesta",
    [httpx.Response(500), httpx.Response(200, json={"choices": []})],
)
def test_el_juez_local_falla_sin_eco_de_los_textos_cuando_no_responde_o_la_forma_es_otra(
    respuesta: httpx.Response,
) -> None:
    with respx.mock() as http:
        http.post(COMPLETIONS).mock(return_value=respuesta)
        with pytest.raises(JuezNoDisponible) as error:
            _juzgar_local_con(respuesta, "salida secreta")

    assert "secreta" not in str(error.value)


def _juzgar_local_con(respuesta: httpx.Response, texto: str) -> None:
    async def _correr() -> None:
        async with AsyncExitStack() as pila:
            juez = await crear_juez_no_inferencia(
                _config_del_juez(LOCAL), pila, RegistroDeLlamadas(), CLASE_SINTETICA
            )
            assert juez is not None
            await juez.atribuye_valor(texto, "Ki-67")

    asyncio.run(_correr())


def test_la_creacion_del_juez_rechaza_un_host_de_nube_sin_enviar_requests_rn12() -> None:
    async def _correr() -> None:
        async with AsyncExitStack() as pila:
            await crear_juez_no_inferencia(
                _config_del_juez(NUBE), pila, RegistroDeLlamadas(), CLASE_SINTETICA
            )

    with respx.mock(assert_all_called=False) as http:
        ruta = http.route().mock(return_value=_respuesta("{}"))
        with pytest.raises(SuiteAbortada):
            asyncio.run(_correr())

    assert ruta.call_count == 0


def test_la_creacion_del_juez_devuelve_none_sin_configuracion_y_el_lexico_con_proveedor_fake() -> (
    None
):
    async def _correr() -> tuple[object, object]:
        async with AsyncExitStack() as pila:
            sin = await crear_juez_no_inferencia(None, pila, RegistroDeLlamadas(), CLASE_SINTETICA)
            fake = await crear_juez_no_inferencia(
                _config_del_juez(None, "fake"), pila, RegistroDeLlamadas(), CLASE_SINTETICA
            )
            return sin, fake

    sin, fake = asyncio.run(_correr())

    assert sin is None
    assert isinstance(fake, JuezNoInferenciaLexico)


# --- la familia y el reporte ------------------------------------------------------------------------------------------


def _con(*medidos: ResultadoNoInferencia | None):
    return [consulta(no_inferencia=m) for m in medidos]


def test_la_familia_agrega_casos_inferencias_y_ids_cuando_hay_casos_con_faltantes() -> None:
    familia = no_inferencia(
        _con(
            ResultadoNoInferencia("C1", inferencias=2),
            ResultadoNoInferencia("C2", inferencias=0),
            ResultadoNoInferencia("C3", inferencias=0, veredictos_invalidos=3),
            None,
        )
    )

    assert familia == {
        "estado": "medida",
        "casos": 3,
        "casos_sin_inferencia": 1,
        "casos_con_inferencia": ["C1"],
        "inferencias": 2,
        "veredictos_invalidos": 3,
    }


def test_la_familia_vale_null_y_no_medida_cuando_ningun_resultado_declara_faltantes() -> None:
    familia = no_inferencia(_con(None, None))

    assert familia["inferencias"] is None
    assert familia["estado"] == "no_medida"


def test_la_familia_vale_null_y_no_medida_sin_resultados() -> None:
    assert no_inferencia([])["inferencias"] is None


def test_el_esquema_cerrado_del_reporte_admite_la_familia_medida_y_la_no_medida() -> None:
    validacion = {"preguntas_validadas": 0, "preguntas_no_validadas": 1, "rotulo": "no_validada"}
    for resultados in (_con(ResultadoNoInferencia("C1", inferencias=1)), _con(None)):
        familia = {**no_inferencia(resultados), "validacion": validacion}

        validar_esquema_cerrado(
            {"no_inferencia": familia},
            ESQUEMA_SUITE.campos["metricas"].campos["completa"],
        )


def test_el_esquema_cerrado_rechaza_un_texto_libre_en_los_ids_de_caso() -> None:
    validacion = {"preguntas_validadas": 0, "preguntas_no_validadas": 1, "rotulo": "no_validada"}
    familia = {**no_inferencia(_con(None)), "casos_con_inferencia": ["texto con espacios"]}

    with pytest.raises(ReporteFueraDeEsquema):
        validar_esquema_cerrado(
            {"no_inferencia": {**familia, "validacion": validacion}},
            ESQUEMA_SUITE.campos["metricas"].campos["completa"],
        )
