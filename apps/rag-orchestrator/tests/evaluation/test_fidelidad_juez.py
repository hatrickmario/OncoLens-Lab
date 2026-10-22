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

from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.evaluate import main
from app.evaluation.guardas import SuiteAbortada, exigir_juez_local
from app.evaluation.juez_fidelidad import JuezLlmLocal, JuezNoDisponible
from app.evaluation.metricas.fidelidad import fidelidad
from tests.evaluation.conftest import RAIZ_APP
from tests.evaluation.test_suite_unitarios import consulta
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
NUBE = "https://api.nube-de-prueba.invalid/v1"
LOCAL = "http://127.0.0.1:11434/v1"
COMPLETIONS = f"{LOCAL}/chat/completions"


def config_con_juez(tmp_path: Path, **juez: object) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["juez"] = {"proveedor": "fake", "modelo": "fake-juez@1", **juez}
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
        ruta = http.post(COMPLETIONS).mock(return_value=veredicto("SOPORTADA"))
        codigo, reporte = correr(config, tmp_path / "salida")
        peticiones = ruta.call_count

    assert codigo == 0 and reporte is not None
    familia = reporte["metricas"]["completa"].get("fidelidad")
    assert familia is not None
    assert familia["nli"] == {"afirmaciones": 4, "soportadas": 3, "fidelidad": 0.75}
    assert familia["juez_llm"] == {
        "rotulo": "secundaria",
        "afirmaciones": 4,
        "soportadas": 4,
        "fidelidad": 1.0,
        "discrepancias_con_nli": 1,
    }
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
        ruta = http.post(COMPLETIONS).mock(return_value=veredicto("SOPORTADA"))
        juez = JuezLlmLocal(
            httpx.AsyncClient(base_url=LOCAL), modelo="juez@1", temperatura=0.0, semilla=7
        )

        resultado = asyncio.run(juez.soporta("afirmación", ["premisa"]))
        cuerpo = json.loads(ruta.calls[0].request.content)

    assert resultado is True
    assert (cuerpo["model"], cuerpo["temperature"], cuerpo["seed"]) == ("juez@1", 0.0, 7)


@pytest.mark.parametrize(
    ("contenido", "esperado"), [("NO_SOPORTADA", False), (" soportada\n", True)]
)
def test_el_juez_llm_local_interpreta_su_veredicto(contenido: str, esperado: bool) -> None:
    with respx.mock() as http:
        http.post(COMPLETIONS).mock(return_value=veredicto(contenido))
        juez = JuezLlmLocal(
            httpx.AsyncClient(base_url=LOCAL), modelo="juez@1", temperatura=0.0, semilla=1
        )

        assert asyncio.run(juez.soporta("a", ["p"])) is esperado


@pytest.mark.parametrize(
    "respuesta",
    [httpx.Response(500), veredicto("quizá"), httpx.Response(200, json={"otra": "cosa"})],
)
def test_el_juez_llm_local_falla_cerrado_sin_detalle_cuando_no_responde_o_no_se_entiende(
    respuesta: httpx.Response,
) -> None:
    with respx.mock() as http:
        http.post(COMPLETIONS).mock(return_value=respuesta)
        juez = JuezLlmLocal(
            httpx.AsyncClient(base_url=LOCAL), modelo="juez@1", temperatura=0.0, semilla=1
        )

        with pytest.raises(JuezNoDisponible) as error:
            asyncio.run(juez.soporta("afirmación secreta", ["premisa secreta"]))

    assert "secreta" not in str(error.value)


def test_la_fidelidad_cuenta_afirmaciones_soportadas_y_discrepancias_con_el_juez() -> None:
    resultados = [
        consulta(afirmaciones_nli=(True, False), afirmaciones_juez=(True, True)),
        consulta(afirmaciones_nli=(True,), afirmaciones_juez=(False,)),
    ]

    assert fidelidad(resultados) == {
        "nli": {"afirmaciones": 3, "soportadas": 2, "fidelidad": 2 / 3},
        "juez_llm": {
            "rotulo": "secundaria",
            "afirmaciones": 3,
            "soportadas": 2,
            "fidelidad": 2 / 3,
            "discrepancias_con_nli": 2,
        },
    }


def test_la_fidelidad_es_none_y_no_cero_cuando_no_hay_afirmaciones() -> None:
    assert fidelidad([consulta()])["nli"] == {
        "afirmaciones": 0,
        "soportadas": 0,
        "fidelidad": None,
    }


def test_las_variables_eval_judge_sustituyen_al_yaml_y_cambian_la_huella(tmp_path: Path) -> None:
    config = config_con_juez(tmp_path)
    entorno = {
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
    config = cargar_config_suite(CONFIG, {"EVAL_JUDGE_MODEL": "m@1", "EVAL_JUDGE_BASE_URL": NUBE})

    with pytest.raises(SuiteAbortada):
        exigir_juez_local(config.juez)


def test_la_guarda_del_juez_deja_pasar_un_juez_local_y_la_ausencia_de_juez() -> None:
    exigir_juez_local(None)
    exigir_juez_local(
        cargar_config_suite(CONFIG, {"EVAL_JUDGE_MODEL": "m@1", "EVAL_JUDGE_BASE_URL": LOCAL}).juez
    )
