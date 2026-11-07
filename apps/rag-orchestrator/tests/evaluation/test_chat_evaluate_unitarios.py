"""Reglas pequeñas de la familia ``chat`` de ``evaluate`` (US-269): enlaces, omitidas, peticiones, CLI y configuración local."""

import asyncio
import dataclasses
import json
import shutil
from pathlib import Path

import pytest
import yaml

from app.evaluation import chat
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.dataset_chat import cargar_dataset_de_chat
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.guardas import SuiteAbortada, exigir_proveedor_local
from app.evaluation.rutas import raiz_repo

CONFIG = raiz_repo() / "apps/rag-orchestrator/eval/configs/chat-fake.yaml"
CONFIG_LOCAL = raiz_repo() / "apps/rag-orchestrator/eval/configs/chat-local.yaml"
CHAT_V1 = raiz_repo() / "data" / "eval" / "chat-v1"


def _reporte(dataset, peticiones):
    config = cargar_config_suite(CONFIG)
    return asyncio.run(chat.evaluar(config, dataset, peticiones))["metricas"]["por_tipo"]


def _copia_con_guion(tmp_path: Path, editar):
    destino = tmp_path / "chat-v1"
    shutil.copytree(CHAT_V1, destino)
    ruta = destino / "casos.yaml"
    crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    editar(crudo)
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")
    return cargar_dataset_de_chat(destino)


def test_evaluar_chat_baja_la_precision_de_enlaces_y_los_hechos_presentes_cuando_el_caso_espera_otro_hecho():
    dataset = cargar_dataset_de_chat(CHAT_V1)
    peticiones = chat.peticiones_de_ejemplo(dataset, cargar_config_suite(CONFIG))
    otro = dataclasses.replace(
        peticiones["CHAT-AC01-MAMA"],
        hechos_por_clave={"paciente-a/diagnostico-1": "f1", "paciente-a/her2": "f9"},
    )
    peticiones["CHAT-AC01-MAMA"] = otro

    mama = _reporte(dataset, peticiones)["mama"]

    assert mama["precision_de_enlaces"] == 4 / 5
    assert mama["hechos_presentes"] == 3 / 4


def test_evaluar_chat_cuenta_la_omitida_aparte_y_no_baja_el_soporte_cuando_el_nli_no_sostiene_una_interpretacion(
    tmp_path: Path,
):
    def sin_soporte(crudo):
        guion = next(c for c in crudo["casos"] if c["id"] == "CHAT-AC01-MAMA")["guion"]
        guion["afirmaciones"][1]["text"] = "Carcinoma sin metástasis ganglionares"

    dataset = _copia_con_guion(tmp_path, sin_soporte)
    peticiones = chat.peticiones_de_ejemplo(dataset, cargar_config_suite(CONFIG))

    mama = _reporte(dataset, peticiones)["mama"]

    assert mama["afirmaciones_omitidas"] == 1
    assert mama["soporte_nli"] == 1.0


def test_evaluar_chat_rechaza_la_corrida_cuando_falta_la_peticion_de_un_caso():
    dataset = cargar_dataset_de_chat(CHAT_V1)
    peticiones = chat.peticiones_de_ejemplo(dataset, cargar_config_suite(CONFIG))
    del peticiones["CHAT-AC03-PROSTATA"]

    with pytest.raises(DatasetInvalido, match="CHAT-AC03-PROSTATA"):
        _reporte(dataset, peticiones)


def test_cargar_peticiones_lee_la_peticion_los_hechos_y_la_identidad_cuando_clinical_api_dejo_el_archivo(
    tmp_path: Path,
):
    dataset = cargar_dataset_de_chat(CHAT_V1)
    config = cargar_config_suite(CONFIG)
    origen = chat.peticiones_de_ejemplo(dataset, config)["CHAT-AC02-MAMA"]
    cuerpo = origen.peticion.model_dump(mode="json", by_alias=True, exclude_unset=True)
    cuerpo["catalogVersion"] = "otra-version"
    (tmp_path / "CHAT-AC02-MAMA.json").write_text(
        json.dumps(
            {"peticion": cuerpo, "hechosPorClave": {"paciente-a/her2": "f2"}, "identidad": ["x"]}
        ),
        encoding="utf-8",
    )

    leidas = chat.cargar_peticiones(tmp_path, config)

    leida = leidas["CHAT-AC02-MAMA"]
    assert leida.hechos_por_clave == {"paciente-a/her2": "f2"} and leida.identidad == ("x",)
    assert leida.peticion.catalogVersion == config.catalogo_version


def test_main_imprime_el_reporte_sin_texto_de_casos_y_lo_escribe_cuando_se_pide_la_salida(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
):
    codigo = chat.main(["--config", str(CONFIG), "--salida", str(tmp_path)])

    impreso = capsys.readouterr().out
    assert codigo == 0
    assert json.loads(impreso) == json.loads((tmp_path / "chat.json").read_text(encoding="utf-8"))
    assert "situación actual" not in impreso and "metastásico" not in impreso


def test_main_termina_con_codigo_2_sin_cifras_cuando_la_config_local_no_trae_las_peticiones(
    capsys: pytest.CaptureFixture[str],
):
    codigo = chat.main(["--config", str(CONFIG_LOCAL)])

    assert codigo == 2
    assert "--peticiones" in capsys.readouterr().err


def test_main_termina_con_codigo_2_nombrando_las_variables_cuando_faltan_los_pesos_locales(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
):
    dataset = cargar_dataset_de_chat(CHAT_V1)
    config = cargar_config_suite(CONFIG)
    for caso in (*dataset.casos, *dataset.controles):
        origen = chat.peticiones_de_ejemplo(dataset, config)[caso.id]
        cuerpo = origen.peticion.model_dump(mode="json", by_alias=True, exclude_unset=True)
        (tmp_path / f"{caso.id}.json").write_text(
            json.dumps({"peticion": cuerpo}), encoding="utf-8"
        )

    codigo = chat.main(["--config", str(CONFIG_LOCAL), "--peticiones", str(tmp_path)], entorno={})

    err = capsys.readouterr().err
    assert codigo == 2
    assert "faltan los pesos" in err and "RERANKER" in err


def test_chat_local_es_un_proveedor_local_con_reloj_real_y_sin_nube_cuando_se_carga_la_config():
    config = cargar_config_suite(CONFIG_LOCAL)

    exigir_proveedor_local(config)  # no lanza: host local y modelo que no corre en la nube

    assert config.proveedor == "local" and config.reloj == "real"
    assert set(config.urls) == {"llm"}


def test_chat_local_aborta_cuando_el_llm_apunta_a_un_host_que_no_es_local(tmp_path: Path):
    crudo = yaml.safe_load(CONFIG_LOCAL.read_text(encoding="utf-8"))
    crudo["adaptadores"]["urls"]["llm"] = "https://api.nube.example/v1"
    ruta = tmp_path / "chat-nube.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")

    with pytest.raises(SuiteAbortada, match="llm"):
        exigir_proveedor_local(cargar_config_suite(ruta))
