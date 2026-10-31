"""Fidelidad por afirmación con juez local, nunca de nube (US-072b, AC-3, RN-12, ADR-41)."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
import yaml

from app.application.ports import EvidenciaGenerada
from app.domain.citations import OpcionGenerada
from app.domain.support import pares_a_verificar
from app.evaluation.afirmaciones import afirmaciones_a_juzgar, plan_de_la_propuesta
from app.evaluation.dataset_loader import CLASE_SINTETICA
from app.evaluation.llamadas import RegistroDeLlamadas
from app.domain.reglas_proveedor import es_modelo_de_nube
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.evaluate import main
from app.evaluation.guardas import SuiteAbortada, exigir_juez_local
from app.evaluation.juez_fidelidad import JuezLlmLocal, JuezNoDisponible
from app.evaluation.metricas.fidelidad import fidelidad
from app.infrastructure.lenguaje.terminos_prohibidos import cargar_verificador_de_terminos
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.evaluation.test_suite_unitarios import consulta
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
NUBE = "https://api.nube-de-prueba.invalid/v1"
LOCAL = "http://127.0.0.1:11434/v1"
COMPLETIONS = f"{LOCAL}/chat/completions"
CLAVES_DEL_JUEZ_SIN_ACUERDO = {
    "rotulo",
    "afirmaciones",
    "soportadas",
    "fidelidad",
    "discrepancias_con_nli",
    "valor_informativo",
}
CATALOGOS = RAIZ_REPO / "packages" / "clinical-catalogs"


def config_con_juez(tmp_path: Path, **juez: object) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["juez"] = {
        "proveedor": "fake",
        "modelo": "fake-juez@1",
        "acuerdo_minimo": 0.8,
        "muestra_minima": 1,
        **juez,
    }
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


def veredicto(contenido: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": contenido}}]})


def correr(
    config: Path, salida: Path, entorno: dict[str, str] | None = None
) -> tuple[int, dict[str, Any] | None]:
    codigo = main(
        ["--config", str(config), "--suite", "all", "--salida", str(salida)],
        reloj=RelojFijo(),
        entorno=entorno or {},
    )
    archivos = list(salida.glob("*.json")) if salida.exists() else []
    reporte = json.loads(archivos[0].read_text(encoding="utf-8")) if archivos else None
    return codigo, reporte


@pytest.mark.ac("US-072", 3)
def test_evaluate_con_un_juez_de_nube_termina_distinto_de_cero_sin_enviar_requests(
    tmp_path: Path,
) -> None:
    config = config_con_juez(tmp_path)

    with respx.mock(assert_all_called=False) as http:
        http.route().respond(200)
        codigo, reporte = correr(config, tmp_path / "salida", {"EVAL_JUDGE_BASE_URL": NUBE})
        peticiones = len(http.calls)

    assert (codigo != 0, peticiones, reporte) == (True, 0, None)


@pytest.mark.ac("US-072", 3)
def test_evaluate_con_el_juez_local_reporta_la_fidelidad_del_nli_y_la_del_juez_aparte(
    tmp_path: Path,
) -> None:
    config = config_con_juez(
        tmp_path,
        proveedor="local",
        base_url=LOCAL,
        modelo="juez-fingido@1",
        temperatura=0,
        semilla=7,
    )

    with respx.mock(assert_all_called=False) as http:
        ruta = http.post(COMPLETIONS).mock(
            return_value=veredicto('{"veredicto": "soportada", "cita": "F1"}')
        )
        codigo, reporte = correr(config, tmp_path / "salida")
        peticiones = ruta.call_count

    assert codigo == 0 and reporte is not None
    familia = reporte["metricas"]["completa"].get("fidelidad")
    assert familia is not None
    assert familia["nli"] == {"afirmaciones": 4, "soportadas": 3, "fidelidad": 0.75}
    assert (
        {k: v for k, v in familia["juez_llm"].items() if k in CLAVES_DEL_JUEZ_SIN_ACUERDO}
        == {
            "rotulo": "secundaria",
            "afirmaciones": 4,
            "soportadas": 4,
            "fidelidad": None,  # acuerdo 0,75 < 0,8: no concluyente, la cifra queda como valor informativo
            "discrepancias_con_nli": 1,
            "valor_informativo": 1.0,
        }
    )
    assert peticiones == 4


def test_un_juez_de_nube_en_el_yaml_aborta_aunque_el_dataset_sea_sintetico(tmp_path: Path) -> None:
    config = config_con_juez(tmp_path, proveedor="local", base_url=NUBE)

    with respx.mock(assert_all_called=False) as http:
        http.route().respond(200)
        codigo, reporte = correr(config, tmp_path / "salida")
        peticiones = len(http.calls)

    assert (codigo != 0, peticiones, reporte) == (True, 0, None)


def test_la_fidelidad_no_trae_juez_llm_cuando_no_hay_juez_configurado(tmp_path: Path) -> None:
    codigo, reporte = correr(CONFIG, tmp_path / "salida")

    assert codigo == 0 and reporte is not None
    assert set(reporte["metricas"]["completa"]["fidelidad"]) == {"nli", "validacion"}


def test_el_juez_fingido_de_la_ci_reporta_su_fidelidad_como_secundaria(tmp_path: Path) -> None:
    codigo, reporte = correr(config_con_juez(tmp_path), tmp_path / "salida")

    assert codigo == 0 and reporte is not None
    assert reporte["metricas"]["completa"]["fidelidad"]["juez_llm"]["rotulo"] == "secundaria"
    assert reporte["configuracion"]["juez"]["modelo"] == "fake-juez@1"


def test_el_juez_llm_local_envia_modelo_temperatura_y_semilla_de_la_configuracion() -> None:
    with respx.mock() as http:
        ruta = http.post(COMPLETIONS).mock(
            return_value=veredicto('{"veredicto": "soportada", "cita": "F1"}')
        )
        juez = JuezLlmLocal(
            httpx.AsyncClient(base_url=LOCAL),
            modelo="juez@1",
            temperatura=0.0,
            semilla=7,
            registro=RegistroDeLlamadas(),
            clase_datos=CLASE_SINTETICA,
        )

        resultado = asyncio.run(juez.juzgar_soporte("afirmación", ["premisa"]))
        cuerpo = json.loads(ruta.calls[0].request.content)

    assert resultado is True
    assert (cuerpo["model"], cuerpo["temperature"], cuerpo["seed"]) == ("juez@1", 0.0, 7)


@pytest.mark.parametrize(
    ("contenido", "esperado"),
    [
        ('{"veredicto": "no_soportada", "cita": ""}', False),
        (' {"veredicto": "soportada", "cita": "F1"}\n', True),
    ],
)
def test_el_juez_llm_local_interpreta_su_veredicto(contenido: str, esperado: bool) -> None:
    with respx.mock() as http:
        http.post(COMPLETIONS).mock(return_value=veredicto(contenido))
        juez = JuezLlmLocal(
            httpx.AsyncClient(base_url=LOCAL),
            modelo="juez@1",
            temperatura=0.0,
            semilla=1,
            registro=RegistroDeLlamadas(),
            clase_datos=CLASE_SINTETICA,
        )

        assert asyncio.run(juez.juzgar_soporte("a", ["p"])) is esperado


@pytest.mark.parametrize(
    "respuesta",
    [httpx.Response(500), httpx.Response(200, json={"otra": "cosa"})],
)
def test_el_juez_llm_local_falla_cerrado_sin_detalle_cuando_no_responde_o_no_se_entiende(
    respuesta: httpx.Response,
) -> None:
    with respx.mock() as http:
        http.post(COMPLETIONS).mock(return_value=respuesta)
        juez = JuezLlmLocal(
            httpx.AsyncClient(base_url=LOCAL),
            modelo="juez@1",
            temperatura=0.0,
            semilla=1,
            registro=RegistroDeLlamadas(),
            clase_datos=CLASE_SINTETICA,
        )

        with pytest.raises(JuezNoDisponible) as error:
            asyncio.run(juez.juzgar_soporte("afirmación secreta", ["premisa secreta"]))

    assert "secreta" not in str(error.value)


def test_la_fidelidad_cuenta_afirmaciones_soportadas_y_discrepancias_con_el_juez() -> None:
    resultados = [
        consulta(
            afirmaciones_nli=(True, False),
            afirmaciones_juez=(True, True),
            ids_afirmaciones=("p1/a1", "p1/a2"),
            veredictos_invalidos_juez=1,
        ),
        consulta(afirmaciones_nli=(True,), afirmaciones_juez=(False,), ids_afirmaciones=("p2/a1",)),
    ]

    assert fidelidad(resultados, acuerdo_minimo=0.5, muestra_minima=1) == {
        "nli": {"afirmaciones": 3, "soportadas": 2, "fidelidad": 2 / 3},
        "juez_llm": {
            "rotulo": "secundaria",
            "afirmaciones": 3,
            "soportadas": 2,
            "fidelidad": None,  # no concluyente: sin cifra de fidelidad
            "valor_informativo": 2 / 3,
            "discrepancias_con_nli": 2,
            "veredictos_invalidos": 1,
            "acuerdo_con_nli": {
                "muestra": 3,
                "porcentaje": 1 / 3,
                "kappa": pytest.approx(-0.5),
                "discrepancias": ["p1/a2", "p2/a1"],
            },
            "acuerdo_con_humano": "sin_medir",
            "estado": "no_concluyente",
        },
    }


def test_la_fidelidad_es_none_y_no_cero_cuando_no_hay_afirmaciones() -> None:
    assert fidelidad([consulta()], None, None)["nli"] == {
        "afirmaciones": 0,
        "soportadas": 0,
        "fidelidad": None,
    }


def test_las_variables_eval_judge_sustituyen_al_yaml_y_cambian_la_huella(tmp_path: Path) -> None:
    config = config_con_juez(tmp_path)
    entorno = {
        "JUEZ_ACUERDO_MINIMO": "0.8",
        "JUEZ_MUESTRA_MINIMA": "1",
        "EVAL_JUDGE_MODEL": "otro@2",
        "EVAL_JUDGE_BASE_URL": LOCAL,
        "EVAL_JUDGE_TEMPERATURE": "0",
        "EVAL_JUDGE_SEED": "9",
    }

    sin_entorno = cargar_config_suite(config, {})
    con_entorno = cargar_config_suite(config, entorno)

    assert con_entorno.juez is not None and sin_entorno.juez is not None
    assert (con_entorno.juez.proveedor, con_entorno.juez.modelo, con_entorno.juez.semilla) == (
        "local",
        "otro@2",
        9,
    )
    assert con_entorno.hash_config != sin_entorno.hash_config


def test_un_juez_local_sin_url_o_una_temperatura_ilegible_se_rechazan(tmp_path: Path) -> None:
    with pytest.raises(ConfigInvalida):
        cargar_config_suite(config_con_juez(tmp_path, proveedor="local"), {})
    with pytest.raises(ConfigInvalida):
        cargar_config_suite(config_con_juez(tmp_path), {"EVAL_JUDGE_TEMPERATURE": "abc"})


def test_sin_bloque_de_juez_ni_variables_no_hay_juez() -> None:
    assert cargar_config_suite(CONFIG, {}).juez is None


def test_la_guarda_del_juez_aborta_con_una_url_fuera_de_la_lista_local() -> None:
    config = cargar_config_suite(
        CONFIG,
        {
            "JUEZ_ACUERDO_MINIMO": "0.8",
            "JUEZ_MUESTRA_MINIMA": "1",
            "EVAL_JUDGE_MODEL": "m@1",
            "EVAL_JUDGE_BASE_URL": NUBE,
        },
    )

    with pytest.raises(SuiteAbortada):
        exigir_juez_local(config.juez)


def test_la_guarda_del_juez_deja_pasar_un_juez_local_y_la_ausencia_de_juez() -> None:
    exigir_juez_local(None)
    exigir_juez_local(
        cargar_config_suite(
            CONFIG,
            {
                "JUEZ_ACUERDO_MINIMO": "0.8",
                "JUEZ_MUESTRA_MINIMA": "1",
                "EVAL_JUDGE_MODEL": "m@1",
                "EVAL_JUDGE_BASE_URL": LOCAL,
            },
        ).juez
    )


def test_las_afirmaciones_a_juzgar_son_las_que_el_pipeline_envia_al_nli() -> None:
    """Paridad con ``domain.support``: mismos pares (premisa, afirmación) que ``pares_a_verificar``."""
    propuesta = EvidenciaGenerada(
        opciones=(
            OpcionGenerada(
                "Opción A",
                "Primera afirmación limpia. Se sugiere considerar esta opción.",
                ("c1",),
                details=("Detalle limpio.", "Detalle con recomendado para este paciente."),
            ),
            OpcionGenerada("Opción B", "Cita inexistente.", ("zz",)),
        ),
        limitaciones_propuestas=("Limitación limpia.", "El paciente debe recibir esto."),
    )
    textos = {"c1": "texto uno", "c2": "texto dos"}
    verificador = cargar_verificador_de_terminos(CATALOGOS)

    plan = plan_de_la_propuesta(propuesta, textos, verificador.reglas_coincidentes)
    afirmaciones = afirmaciones_a_juzgar(plan)

    pares = pares_a_verificar(plan)
    assert [(p.premisa, p.hipotesis) for p in pares] == [
        (premisa, a.texto) for a in afirmaciones for premisa in a.premisas
    ]
    assert [a.texto for a in afirmaciones] == [
        "Primera afirmación limpia.",
        "Detalle limpio.",
        "Limitación limpia.",
    ]


def test_los_flags_juez_sustituyen_a_las_variables_y_al_yaml_y_la_guarda_los_alcanza(
    tmp_path: Path,
) -> None:
    with respx.mock(assert_all_called=False) as http:
        http.route().respond(200)
        codigo = main(
            ["--config", str(CONFIG), "--salida", str(tmp_path / "s"), "--juez-modelo", "m@1"]
            + ["--juez-base-url", NUBE],
            reloj=RelojFijo(),
            entorno={"EVAL_JUDGE_BASE_URL": LOCAL},
        )
        peticiones = len(http.calls)

    assert (codigo != 0, peticiones, (tmp_path / "s").exists()) == (True, 0, False)


def test_el_juez_llm_local_no_llama_ni_registra_cuando_la_afirmacion_no_tiene_premisas() -> None:
    registro = RegistroDeLlamadas()
    with respx.mock(assert_all_called=False) as http:
        http.route().respond(200)
        juez = JuezLlmLocal(
            httpx.AsyncClient(base_url=LOCAL),
            modelo="m@1",
            temperatura=0.0,
            semilla=1,
            registro=registro,
            clase_datos=CLASE_SINTETICA,
        )
        resultado = asyncio.run(juez.juzgar_soporte("afirmación", []))
        peticiones = len(http.calls)

    assert (resultado, peticiones, registro.llamadas) == (False, 0, [])


def test_las_afirmaciones_de_una_opcion_cuyo_nombre_incumple_el_lenguaje_no_se_juzgan() -> None:
    propuesta = EvidenciaGenerada(
        opciones=(OpcionGenerada("Se recomienda esta opción", "Afirmación limpia.", ("c1",)),)
    )
    plan = plan_de_la_propuesta(
        propuesta, {"c1": "texto"}, cargar_verificador_de_terminos(CATALOGOS).reglas_coincidentes
    )

    assert afirmaciones_a_juzgar(plan) == []
    assert pares_a_verificar(plan) == []


def test_el_cliente_del_juez_ignora_los_proxies_del_entorno_para_no_desviar_el_prompt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from contextlib import AsyncExitStack

    from app.evaluation.juez_fidelidad import crear_juez_llm

    monkeypatch.setenv("HTTP_PROXY", "http://proxy.nube-de-prueba.invalid:8080")
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.nube-de-prueba.invalid:8080")
    config = cargar_config_suite(
        CONFIG,
        {
            "JUEZ_ACUERDO_MINIMO": "0.8",
            "JUEZ_MUESTRA_MINIMA": "1",
            "EVAL_JUDGE_MODEL": "m@1",
            "EVAL_JUDGE_BASE_URL": LOCAL,
        },
    )

    async def crear() -> object:
        async with AsyncExitStack() as pila:
            juez = await crear_juez_llm(config.juez, pila, RegistroDeLlamadas(), CLASE_SINTETICA)
            assert isinstance(juez, JuezLlmLocal)
            return juez._cliente._mounts

    assert asyncio.run(crear()) == {}


@pytest.mark.parametrize("modelo", ["x:cloud", "x:1b-cloud", "deepseek-v3.1:671b-cloud", "X:CLOUD"])
def test_un_modelo_de_nube_en_un_host_local_aborta_sin_requests_y_sin_nombrar_el_modelo(
    tmp_path: Path, modelo: str, capsys: pytest.CaptureFixture[str]
) -> None:
    config = config_con_juez(tmp_path, proveedor="local", base_url=LOCAL, modelo=modelo)

    with respx.mock(assert_all_called=False) as http:
        http.route().respond(200)
        codigo, reporte = correr(config, tmp_path / "salida")
        peticiones = len(http.calls)

    assert (codigo, peticiones, reporte) == (1, 0, None)
    assert modelo not in capsys.readouterr().err


def test_la_guarda_del_juez_rechaza_un_modelo_de_nube_y_acepta_uno_local() -> None:
    entorno = {"EVAL_JUDGE_BASE_URL": LOCAL}
    with pytest.raises(SuiteAbortada):
        exigir_juez_local(
            cargar_config_suite(
                CONFIG,
                {
                    **entorno,
                    "JUEZ_ACUERDO_MINIMO": "0.8",
                    "JUEZ_MUESTRA_MINIMA": "1",
                    "EVAL_JUDGE_MODEL": "x:cloud",
                },
            ).juez
        )
    exigir_juez_local(
        cargar_config_suite(
            CONFIG,
            {
                **entorno,
                "JUEZ_ACUERDO_MINIMO": "0.8",
                "JUEZ_MUESTRA_MINIMA": "1",
                "EVAL_JUDGE_MODEL": "gemma4:26b-a4b-it-q4_K_M",
            },
        ).juez
    )


def test_crear_juez_llm_tambien_rechaza_un_modelo_de_nube_antes_de_crear_el_cliente() -> None:
    from contextlib import AsyncExitStack

    from app.evaluation.juez_fidelidad import crear_juez_llm

    config = cargar_config_suite(
        CONFIG,
        {
            "EVAL_JUDGE_BASE_URL": LOCAL,
            "JUEZ_ACUERDO_MINIMO": "0.8",
            "JUEZ_MUESTRA_MINIMA": "1",
            "EVAL_JUDGE_MODEL": "x:cloud",
        },
    )

    async def crear() -> None:
        async with AsyncExitStack() as pila:
            await crear_juez_llm(config.juez, pila, RegistroDeLlamadas(), CLASE_SINTETICA)

    with pytest.raises(SuiteAbortada):
        asyncio.run(crear())


NOMBRES_DE_NUBE_CON_RUIDO = ["x:cloud ", "x:cloud\t", "x:cloud\u00a0", "x:cloud\r", " X:1B-CLOUD "]


@pytest.mark.parametrize("modelo", NOMBRES_DE_NUBE_CON_RUIDO)
@pytest.mark.parametrize("canal", ["yaml", "entorno", "flag"])
def test_un_modelo_de_nube_con_espacios_o_control_no_envia_requests_por_ningun_canal(
    tmp_path: Path, modelo: str, canal: str, capsys: pytest.CaptureFixture[str]
) -> None:
    argv = ["--suite", "all", "--salida", str(tmp_path / "s")]
    entorno: dict[str, str] = {}
    if canal == "yaml":
        config = config_con_juez(tmp_path, proveedor="local", base_url=LOCAL, modelo=modelo)
    else:
        config = CONFIG
        if canal == "entorno":
            entorno = {
                "EVAL_JUDGE_BASE_URL": LOCAL,
                "JUEZ_ACUERDO_MINIMO": "0.8",
                "JUEZ_MUESTRA_MINIMA": "1",
                "EVAL_JUDGE_MODEL": modelo,
            }
        else:
            argv += ["--juez-base-url", LOCAL, "--juez-modelo", modelo]

    with respx.mock(assert_all_called=False) as http:
        http.route().respond(200)
        codigo = main(["--config", str(config), *argv], reloj=RelojFijo(), entorno=entorno)
        peticiones = len(http.calls)

    assert (codigo in (1, 2), peticiones, (tmp_path / "s").exists()) == (True, 0, False)
    assert modelo.strip() not in capsys.readouterr().err


@pytest.mark.parametrize("modelo", NOMBRES_DE_NUBE_CON_RUIDO)
def test_es_modelo_de_nube_normaliza_espacios_y_compatibilidad_unicode(modelo: str) -> None:
    assert es_modelo_de_nube(modelo) is True


@pytest.mark.parametrize("modelo", ["gemma4:26b-a4b-it-q4_K_M", "cloudy:1b", "x:cloudless"])
def test_es_modelo_de_nube_no_marca_un_modelo_local(modelo: str) -> None:
    assert es_modelo_de_nube(modelo) is False


def test_un_modelo_con_espacios_es_un_identificador_invalido_antes_de_cualquier_request() -> None:
    with pytest.raises(ConfigInvalida) as error:
        cargar_config_suite(
            CONFIG,
            {
                "EVAL_JUDGE_BASE_URL": LOCAL,
                "JUEZ_ACUERDO_MINIMO": "0.8",
                "JUEZ_MUESTRA_MINIMA": "1",
                "EVAL_JUDGE_MODEL": "m@1 ",
            },
        )
    assert "m@1" not in str(error.value)
