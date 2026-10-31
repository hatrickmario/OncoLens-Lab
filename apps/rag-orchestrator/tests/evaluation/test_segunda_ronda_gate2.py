"""Segunda ronda del Gate 2 de L1D-298 (US-233a): lenguaje por nivel, concluyencia del juez, renombres, privacidad.

Cada test fija una regla que la primera ronda dejó sin cubrir (mutantes vivos del revisor) o un contrato nuevo del
reporte. Solo agregados e ids de regla: ningún test escribe texto clínico ni generado (RN-14).
"""

from __future__ import annotations

import asyncio
import inspect
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from app.application.generation import LlmEvidenceGenerator
from app.config.modelos import ConfigInvalida as ConfigDeModelosInvalida
from app.config.modelos import cargar_config_modelos
from app.config.settings import Settings
from app.evaluation.acuerdo_juez import marcar_fidelidad_no_concluyente
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.cronometro import percentil
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.juez_fidelidad import JuezLlmLocal
from app.evaluation.llamadas import RegistroDeLlamadas
from app.evaluation.medicion_modelos import (
    informe_de_recursos_nli,
    mediana_estadistica,
    percentil_95_interpolado,
)
from app.evaluation.metricas.familias import calcular_familias
from app.evaluation.metricas.fidelidad import fidelidad
from app.evaluation.metricas.prescriptivas import terminos_prohibidos
from app.evaluation.modelos_locales import OrigenLocal, cargar_puertos_locales
from app.infrastructure.llm.fabrica_local import crear_generador_local, crear_proponente_local
from app.infrastructure.llm.openai_compatible import cuerpo_de_peticion
from app.infrastructure.llm.proponente_de_aplicabilidad import LlmApplicabilityTextProposer
from tests.evaluation.test_fidelidad_juez import COMPLETIONS, CONFIG, LOCAL
from tests.evaluation.test_proveedor_local_unitarios import config_local
from tests.evaluation.test_proveedor_local_aceptacion import modelos_fingidos
from tests.evaluation.test_suite_unitarios import consulta
from tests.support.modelos import crear_entorno_de_modelos

# --- P1-1: dos percentiles con el mismo nombre daban cifras distintas ---------------------------------------------


def test_el_percentil_interpolado_de_medicion_difiere_del_rango_mas_cercano_del_cronometro() -> (
    None
):
    serie = [10.0, 20.0, 30.0, 40.0]

    assert percentil_95_interpolado(serie) == pytest.approx(38.5)
    assert percentil(serie, 0.95) == 40.0
    assert mediana_estadistica(serie) == 25.0


def test_el_percentil_interpolado_documenta_que_no_es_comparable_con_el_del_cronometro() -> None:
    assert "no comparable con cronometro.percentil" in (percentil_95_interpolado.__doc__ or "")


# --- P1-2 y P1-3: nombres que dicen lo que miden ----------------------------------------------------------------------


def test_el_informe_de_recursos_nombra_la_media_por_lote_y_el_pico_de_todo_el_proceso() -> None:
    informe = informe_de_recursos_nli([2.0, 4.0], [1.0, 1.0, 2.0, 2.0], 5000.0, 4489.0)

    assert set(informe) == {
        "rss_pico_proceso_mib",
        "rss_limite_mib",
        "supera_el_limite",
        "latencia_ms",
    }
    assert set(informe["latencia_ms"]) == {  # type: ignore[arg-type]
        "por_lote",
        "media_por_hipotesis_del_lote_ms",
    }


# --- P1-4: el error de configuración de modelos expone las claves, no se parsea su texto ---------------------------


@pytest.mark.parametrize(
    ("clave", "valor"),
    [("EMBEDDING_DIM", "1; /ruta/privada"), ("CHUNK_SELECTION_MARGIN", "1; /ruta/privada")],
)
def test_la_configuracion_de_modelos_invalida_expone_las_claves_y_la_suite_no_repite_el_valor(
    tmp_path: Path, clave: str, valor: str
) -> None:
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").con(**{clave: valor})

    with pytest.raises(ConfigDeModelosInvalida) as invalida:
        cargar_config_modelos(entorno)
    with pytest.raises(SuiteAbortada) as abortada:
        cargar_puertos_locales(
            config_local(),
            OrigenLocal(entorno, modelos_fingidos, lambda: 0.0),
            RegistroDeLlamadas(),
            "sintetico",
        )

    assert invalida.value.claves == (clave,)
    assert clave in str(abortada.value)
    assert "ruta" not in str(abortada.value) and "privada" not in str(abortada.value)


# --- P2-1: un fallo de carga no filtra la ruta, ni en el mensaje ni en la cadena de excepciones ------------------


def test_un_fallo_de_carga_con_ruta_no_llega_al_mensaje_ni_a_la_cadena_de_excepciones(
    tmp_path: Path,
) -> None:
    def cargador_que_falla(_: Settings) -> Any:
        raise OSError("/home/x/pesos.onnx")

    entorno = crear_entorno_de_modelos(tmp_path / "pesos").variables

    with pytest.raises(SuiteAbortada) as error:
        cargar_puertos_locales(
            config_local(),
            OrigenLocal(entorno, cargador_que_falla, lambda: 0.0),
            RegistroDeLlamadas(),
            "sintetico",
        )

    assert "pesos.onnx" not in str(error.value) and "/home/x" not in str(error.value)
    assert error.value.__cause__ is None and error.value.__suppress_context__ is True
    assert "OSError" in str(error.value)


# --- P2-2: el acuerdo mínimo y la muestra mínima no tienen valor por defecto en código (RN-22) --------------------


@pytest.mark.parametrize("funcion", [fidelidad, calcular_familias])
def test_el_acuerdo_minimo_y_la_muestra_minima_son_obligatorios_sin_valor_por_defecto(
    funcion: Any,
) -> None:
    parametros = inspect.signature(funcion).parameters

    assert parametros["acuerdo_minimo"].default is inspect.Parameter.empty
    assert parametros["muestra_minima"].default is inspect.Parameter.empty


@pytest.mark.parametrize(
    ("acuerdo", "muestra", "variable"),
    [(None, 5, "JUEZ_ACUERDO_MINIMO"), (0.8, None, "JUEZ_MUESTRA_MINIMA")],
)
def test_con_juez_y_sin_minimo_la_fidelidad_aborta_nombrando_la_variable_de_configuracion(
    acuerdo: float | None, muestra: int | None, variable: str
) -> None:
    con_juez = consulta(
        afirmaciones_nli=(True,), afirmaciones_juez=(True,), ids_afirmaciones=("q/a1",)
    )

    with pytest.raises(ConfigInvalida, match=variable):
        fidelidad([con_juez], acuerdo, muestra)


def test_sin_juez_la_fidelidad_no_exige_minimos() -> None:
    assert "juez_llm" not in fidelidad([consulta(afirmaciones_nli=(True,))], None, None)


# --- (5) y (6): «concluyente» exige muestra mínima; sin concluir no hay cifra de fidelidad -------------------------


@pytest.mark.parametrize(
    ("porcentaje", "muestra", "marcado"),
    [(0.9, 4, True), (0.9, 5, False), (0.79, 50, True), (None, 50, True)],
)
def test_la_fidelidad_del_juez_no_es_concluyente_bajo_el_acuerdo_o_bajo_la_muestra_minima(
    porcentaje: float | None, muestra: int, marcado: bool
) -> None:
    assert marcar_fidelidad_no_concluyente(porcentaje, 0.8, muestra, 5) is marcado


def _consulta_con_juez(n: int, *, acuerdan: bool = True) -> Any:
    ids = tuple(f"q/a{i}" for i in range(n))
    return consulta(
        afirmaciones_nli=(True,) * n,
        afirmaciones_juez=(True,) * n if acuerdan else (False,) * n,
        ids_afirmaciones=ids,
    )


def test_una_muestra_menor_que_la_minima_deja_el_juez_no_concluyente_aunque_acuerde_en_todo() -> (
    None
):
    juez = fidelidad([_consulta_con_juez(3)], 0.8, 10)["juez_llm"]

    assert juez["acuerdo_con_nli"]["porcentaje"] == 1.0
    assert juez["estado"] == "no_concluyente"


def test_la_fidelidad_del_juez_es_null_con_el_valor_informativo_aparte_cuando_no_concluye() -> None:
    juez = fidelidad([_consulta_con_juez(3)], 0.8, 10)["juez_llm"]

    assert juez["fidelidad"] is None
    assert juez["valor_informativo"] == 1.0


def test_la_fidelidad_del_juez_lleva_su_cifra_cuando_concluye() -> None:
    juez = fidelidad([_consulta_con_juez(10)], 0.8, 10)["juez_llm"]

    assert juez["estado"] == "concluyente"
    assert (juez["fidelidad"], juez["valor_informativo"]) == (1.0, None)


def test_las_discrepancias_con_el_nli_se_derivan_del_acuerdo_con_el_nli() -> None:
    juez = fidelidad([_consulta_con_juez(4, acuerdan=False)], 0.8, 1)["juez_llm"]

    assert juez["discrepancias_con_nli"] == len(juez["acuerdo_con_nli"]["discrepancias"]) == 4


def test_la_muestra_minima_del_juez_es_obligatoria_y_viene_de_la_configuracion() -> None:
    entorno = {
        "EVAL_JUDGE_MODEL": "m@1",
        "EVAL_JUDGE_BASE_URL": LOCAL,
        "JUEZ_ACUERDO_MINIMO": "0.7",
    }

    with pytest.raises(ConfigInvalida, match="muestra_minima"):
        cargar_config_suite(CONFIG, entorno)
    config = cargar_config_suite(CONFIG, {**entorno, "JUEZ_MUESTRA_MINIMA": "12"})

    assert config.juez is not None and config.juez.muestra_minima == 12


@pytest.mark.parametrize("valor", ["0", "-3", "abc", "2.5"])
def test_la_muestra_minima_no_positiva_o_ilegible_se_rechaza(valor: str) -> None:
    entorno = {
        "EVAL_JUDGE_MODEL": "m@1",
        "EVAL_JUDGE_BASE_URL": LOCAL,
        "JUEZ_ACUERDO_MINIMO": "0.7",
        "JUEZ_MUESTRA_MINIMA": valor,
    }

    with pytest.raises(ConfigInvalida, match="muestra_minima"):
        cargar_config_suite(CONFIG, entorno)


# --- P3-4: fronteras de las validaciones de configuración ------------------------------------------------------------


@pytest.mark.parametrize(
    ("valor", "valido"), [("1.0", True), ("0.0", True), ("1.01", False), ("-0.01", False)]
)
def test_el_acuerdo_minimo_admite_los_extremos_cero_y_uno_y_rechaza_lo_que_los_excede(
    valor: str, valido: bool
) -> None:
    entorno = {
        "EVAL_JUDGE_MODEL": "m@1",
        "EVAL_JUDGE_BASE_URL": LOCAL,
        "JUEZ_ACUERDO_MINIMO": valor,
        "JUEZ_MUESTRA_MINIMA": "1",
    }

    if valido:
        assert cargar_config_suite(CONFIG, entorno).juez is not None
    else:
        with pytest.raises(ConfigInvalida, match="acuerdo_minimo"):
            cargar_config_suite(CONFIG, entorno)


@pytest.mark.parametrize(("limite", "valido"), [(0.001, True), (0, False), (-1, False)])
def test_el_limite_de_rss_debe_ser_estrictamente_positivo(
    tmp_path: Path, limite: float, valido: bool
) -> None:
    import yaml

    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["medicion"]["rss_limite_mib"] = limite
    ruta = tmp_path / "rss.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")

    if valido:
        assert cargar_config_suite(ruta, {}).rss_limite_mib == limite
    else:
        with pytest.raises(ConfigInvalida, match="rss_limite_mib"):
            cargar_config_suite(ruta, {})


# --- Lenguaje (RN-23): salida mostrada por nivel y campos, sin texto --------------------------------------------------


def test_la_salida_mostrada_se_separa_por_nivel_con_el_campo_y_la_regla_pero_sin_texto() -> None:
    resultados = [
        consulta(
            salidas_prohibidas_mostradas=2,
            salidas_mostradas_nivel_a=1,
            salidas_mostradas_nivel_b=2,
            campos_mostrados=(("rationale", "b-recommend"), ("option", "es-debe-recibir")),
        ),
        consulta(),
    ]

    familia = terminos_prohibidos(resultados)

    assert familia["salida_mostrada_nivel_a"] == 1
    assert familia["salida_mostrada_nivel_b"] == 2
    assert familia["salida_mostrada_por_nivel"] == {"A": 1, "B": 2}
    assert familia["campos_mostrados"] == [
        {"campo": "rationale", "regla": "b-recommend"},
        {"campo": "option", "regla": "es-debe-recibir"},
    ]
    assert (
        familia["salida_mostrada"] == 2
    )  # contador de CAMPOS con algún término (A o B), no de salidas


def test_los_contadores_de_campos_lo_dicen_en_el_esquema() -> None:
    from app.evaluation import esquema_suite

    fuente = inspect.getsource(esquema_suite)

    assert "campos_con_termino_de_la_lista" in fuente


# --- P2-3: la suite compone el generador y el proponente con la fábrica de producción --------------------------------


def _huella(generador: LlmEvidenceGenerator) -> tuple[object, ...]:
    cliente: Any = generador._cliente  # noqa: SLF001
    cliente = getattr(cliente, "_interno", cliente)
    return (
        cliente._url,  # noqa: SLF001
        cliente._model,  # noqa: SLF001
        cliente._timeout_s,  # noqa: SLF001
        cliente._max_output_tokens,  # noqa: SLF001
        cliente._temperature,  # noqa: SLF001
        generador._max_chars_fragmentos,  # noqa: SLF001
        generador._max_parrafos_detalle,  # noqa: SLF001
    )


def test_el_generador_de_la_suite_y_el_de_produccion_tienen_la_misma_configuracion(
    tmp_path: Path,
) -> None:
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").con(
        LLM_REQUEST_TIMEOUT_MS="12345",
        LLM_MAX_OUTPUT_TOKENS="777",
        LLM_TEMPERATURE="0.3",
        LLM_FRAGMENTS_MAX_CHARS="999",
    )
    config = config_local()

    puertos = cargar_puertos_locales(
        config,
        OrigenLocal(entorno, modelos_fingidos, lambda: 0.0),
        RegistroDeLlamadas(),
        "sintetico",
    )
    de_produccion = crear_generador_local(
        Settings(
            _env_file=None,  # type: ignore[call-arg]
            llm_base_url=config.urls["llm"],
            llm_model=config.llm_modelo,
            llm_request_timeout_ms=12345,
            llm_max_output_tokens=777,
            llm_temperature=0.3,
            llm_fragments_max_chars=999,
        )
    )

    assert isinstance(puertos.generador, LlmEvidenceGenerator)
    assert _huella(puertos.generador) == _huella(de_produccion)
    assert _huella(puertos.generador)[2:6] == (12.345, 777, 0.3, 999)


def test_el_proponente_de_la_suite_local_es_el_de_produccion_y_no_el_silencioso(
    tmp_path: Path,
) -> None:
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").variables
    puertos = cargar_puertos_locales(
        config_local(),
        OrigenLocal(entorno, modelos_fingidos, lambda: 0.0),
        RegistroDeLlamadas(),
        "sintetico",
    )

    assert isinstance(puertos.proponente, LlmApplicabilityTextProposer)
    assert isinstance(
        crear_proponente_local(Settings(_env_file=None)),  # type: ignore[call-arg]
        LlmApplicabilityTextProposer,
    )


def test_la_suite_no_importa_app_bootstrap() -> None:
    from app.evaluation import medicion_alias, modelos_locales

    for modulo in (modelos_locales, medicion_alias):
        assert "app.bootstrap" not in inspect.getsource(modulo)


# --- P2-4: el juez arma su petición con el mismo constructor que producción ---------------------------------------------


def test_la_peticion_del_juez_y_la_de_produccion_comparten_el_constructor_del_cuerpo() -> None:
    esquema = {"type": "object"}

    cuerpo = cuerpo_de_peticion(
        "m@1",
        "usuario",
        esquema,
        0.0,
        64,
        sistema="sistema",
        semilla=7,
        nombre_del_esquema="veredicto",
    )

    assert cuerpo["messages"] == [
        {"role": "system", "content": "sistema"},
        {"role": "user", "content": "usuario"},
    ]
    assert cuerpo["seed"] == 7 and cuerpo["stream"] is False
    assert cuerpo["response_format"]["json_schema"]["name"] == "veredicto"
    sin_juez = cuerpo_de_peticion("m@1", "usuario", esquema, 0.0, 64)
    assert "seed" not in sin_juez and sin_juez["messages"] == [
        {"role": "user", "content": "usuario"}
    ]


def test_el_cuerpo_que_envia_el_juez_tiene_las_claves_del_cuerpo_de_produccion_incluido_stream_false() -> (
    None
):
    capturado: dict[str, Any] = {}

    def responder(peticion: httpx.Request) -> httpx.Response:
        capturado.update(json.loads(peticion.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    with respx.mock() as http:
        http.post(COMPLETIONS).mock(side_effect=responder)
        juez = JuezLlmLocal(
            httpx.AsyncClient(base_url=LOCAL),
            modelo="juez@1",
            temperatura=0.0,
            semilla=1,
            registro=RegistroDeLlamadas(),
            clase_datos="sintetico",
        )
        asyncio.run(juez.completar("sistema", "usuario"))

    esperado = cuerpo_de_peticion(
        "juez@1",
        "usuario",
        {},
        0.0,
        1,
        sistema="sistema",
        semilla=1,
        nombre_del_esquema="veredicto",
    )
    assert set(capturado) == set(esperado)
    assert capturado["stream"] is False


# --- Privacidad menor: el chequeo de .env.example imprime claves, no valores ---------------------------------------


def test_el_chequeo_de_configuracion_invalida_imprime_solo_las_claves() -> None:
    from app.evaluation.chequeo_config import problemas_de_configuracion_invalida

    problemas = problemas_de_configuracion_invalida(
        {"EMBEDDING_DIM": "valor-secreto; /ruta/privada"}
    )

    assert problemas and all("valor-secreto" not in p and "privada" not in p for p in problemas)
    assert any("EMBEDDING_DIM" in p for p in problemas)
