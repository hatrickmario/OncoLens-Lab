"""Residual de la familia ``chat`` de ``evaluate`` (L1D-326, US-269): reloj, faltantes no medidos, LLM caído, umbrales de
``Settings``, peticiones preparadas por ``clinical-api`` y el control de identidad.

Adapters falsos y datos solo sintéticos (RN-14): ningún test abre un socket ni carga pesos. Las peticiones preparadas se generan
en el propio test con la forma ``{peticion, hechosPorClave, identidad}`` que deja ``npm run eval:chat-preparar``; la identidad
sintética se compone en ejecución (``chat.identidad_de_prueba``), nunca un literal del repositorio.
"""

import asyncio
import dataclasses
import json
from collections.abc import Mapping
from pathlib import Path

import pytest
import yaml

from app.application.ports import FalloDelLlm
from app.evaluation import chat
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.dataset_chat import cargar_dataset_de_chat
from app.evaluation.rutas import raiz_repo

CONFIG = raiz_repo() / "apps/rag-orchestrator/eval/configs/chat-fake.yaml"
CONFIG_LOCAL = raiz_repo() / "apps/rag-orchestrator/eval/configs/chat-local.yaml"
CHAT_V1 = raiz_repo() / "data" / "eval" / "chat-v1"
CASO_PII = "CHAT-AC01-MAMA-PII"
UMBRALES_DEL_ENTORNO: Mapping[str, str] = {
    "RELEVANCE_THRESHOLD": "0.31",
    "NLI_ENTAILMENT_THRESHOLD": "0.72",
    "RETRIEVAL_TOP_K": "31",
    "RERANK_TOP_N": "9",
}
"""Valores del entorno (RN-22) distintos a propósito de los del YAML de la CI y de cualquier valor por defecto."""
MASCARA_DE_CLINICAL_API = "La paciente [NOMBRE] [NOMBRE] [NOMBRE], SINT-[NOMBRE]-[DOCUMENTO], nacida el [FECHA], ¿cuál es su situación actual?"  # noqa: E501


class NoFiltra:
    """El filtro de RN-23 desactivado (solo para probar que la corrida lo detectaría)."""

    version = "sin-filtro"

    def reglas_coincidentes(self, texto, campo, fuentes):  # noqa: ANN001, ANN201
        return ()


class LlmCaido:
    """El LLM local detenido: el mismo error que lanza el adapter real ante un fallo de conexión (``FalloDelLlm``)."""

    async def completar_json(self, usuario, esquema, *, sistema=None):  # noqa: ANN001, ANN201
        raise FalloDelLlm("el LLM local no entregó una respuesta utilizable")


class LlmQueNoDevuelveJson:
    """El LLM responde, pero su salida no es JSON: no es una dependencia caída."""

    async def completar_json(self, usuario, esquema, *, sistema=None):  # noqa: ANN001, ANN201
        return "esto no es json"


def _escribir_peticiones(directorio: Path, peticiones: Mapping[str, chat.PeticionDeChat]) -> None:
    """Lo que deja ``eval:chat-preparar``: una ``<id-del-caso>.json`` con ``peticion``, ``hechosPorClave`` e ``identidad``."""
    for id_del_caso, entrada in peticiones.items():
        cuerpo = entrada.peticion.model_dump(mode="json", by_alias=True, exclude_unset=True)
        (directorio / f"{id_del_caso}.json").write_text(
            json.dumps(
                {
                    "peticion": cuerpo,
                    "hechosPorClave": dict(entrada.hechos_por_clave),
                    "identidad": list(entrada.identidad),
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )


def _peticiones_preparadas(tmp_path: Path) -> Path:
    dataset = cargar_dataset_de_chat(CHAT_V1)
    ejemplos = chat.peticiones_de_ejemplo(dataset, cargar_config_suite(CONFIG))
    directorio = tmp_path / "peticiones"
    directorio.mkdir()
    _escribir_peticiones(directorio, ejemplos)
    return directorio


def _correr(config_ruta: Path = CONFIG, peticiones=None, puertos=None):
    config = cargar_config_suite(config_ruta)
    dataset = cargar_dataset_de_chat(CHAT_V1)
    peticiones = peticiones or chat.peticiones_de_ejemplo(dataset, config)
    return asyncio.run(chat.evaluar(config, dataset, peticiones, puertos=puertos))


def _config_sin_umbrales(tmp_path: Path) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    del crudo["umbrales"]
    ruta = tmp_path / "chat-sin-umbrales.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


@pytest.mark.ac("US-269", 7)
def test_evaluar_chat_declara_el_reloj_y_el_proveedor_y_rotula_la_latencia_como_simulada_cuando_corre_con_chat_fake():  # noqa: E501
    reporte = _correr()

    assert reporte.get("reloj") == "simulado"
    assert reporte["modelos"]["proveedor"] == "fake"
    assert reporte["metricas"]["latencia"].get("rotulo") == "simulada"
    assert reporte["metricas"]["latencia"]["informativa"] is True


@pytest.mark.ac("US-269", 4)
def test_evaluar_chat_publica_las_metricas_de_faltantes_como_null_en_la_lista_de_no_medidas_y_nunca_como_cero():  # noqa: E501
    metricas = _correr()["metricas"]

    faltantes = metricas.get("faltantes", {})
    assert set(faltantes) == {"sensibilidad", "especificidad", "exactitud_de_gap_type"}
    assert all(valor is None for valor in faltantes.values())
    assert sorted(metricas.get("no_medidas", [])) == [
        "faltantes.especificidad",
        "faltantes.exactitud_de_gap_type",
        "faltantes.sensibilidad",
    ]


@pytest.mark.ac("US-269", 3)
def test_main_termina_con_codigo_distinto_de_cero_y_no_escribe_chat_json_cuando_el_llm_local_no_responde(  # noqa: E501
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
):
    codigo = chat.main(
        ["--config", str(CONFIG), "--salida", str(tmp_path / "salida")],
        puertos=chat.PuertosDeChat(llm=LlmCaido()),
    )

    assert codigo == 2
    assert not (tmp_path / "salida" / "chat.json").exists()
    assert "LLM" in capsys.readouterr().err


def test_evaluar_chat_cuenta_el_turno_como_errado_y_no_aborta_cuando_la_salida_del_llm_no_es_json():
    reporte = _correr(puertos=chat.PuertosDeChat(llm=LlmQueNoDevuelveJson()))

    assert reporte["metricas"]["exactitud_de_intent"] < 1.0
    assert reporte["casos"] == 13


@pytest.mark.ac("US-269", 3)
def test_cargar_config_suite_usa_los_umbrales_de_settings_y_los_registra_cuando_la_configuracion_no_los_declara(  # noqa: E501
    tmp_path: Path,
):
    config = cargar_config_suite(_config_sin_umbrales(tmp_path), UMBRALES_DEL_ENTORNO)
    dataset = cargar_dataset_de_chat(CHAT_V1)
    reporte = asyncio.run(
        chat.evaluar(config, dataset, chat.peticiones_de_ejemplo(dataset, config))
    )

    assert config.umbrales.relevance_threshold == 0.31
    assert config.umbrales.nli_entailment_threshold == 0.72
    assert (config.umbrales.retrieval_top_k, config.umbrales.rerank_top_n) == (31, 9)
    assert reporte["umbrales"] == {
        "origen": "settings",
        "relevance_threshold": 0.31,
        "nli_entailment_threshold": 0.72,
        "retrieval_top_k": 31,
        "rerank_top_n": 9,
        "claim_max_words": config.umbrales.claim_max_words,
    }


def test_cargar_config_suite_nombra_las_variables_que_faltan_y_no_sus_valores_cuando_el_entorno_esta_incompleto(  # noqa: E501
    tmp_path: Path,
):
    entorno = {k: v for k, v in UMBRALES_DEL_ENTORNO.items() if k != "RERANK_TOP_N"}

    with pytest.raises(ConfigInvalida, match="RERANK_TOP_N") as error:
        cargar_config_suite(_config_sin_umbrales(tmp_path), entorno)

    assert "0.31" not in str(error.value)


def test_cargar_config_suite_cambia_la_huella_cuando_cambia_un_umbral_del_entorno(tmp_path: Path):
    ruta = _config_sin_umbrales(tmp_path)
    otro = {**UMBRALES_DEL_ENTORNO, "RETRIEVAL_TOP_K": "32"}

    base = cargar_config_suite(ruta, UMBRALES_DEL_ENTORNO).hash_config
    cambiada = cargar_config_suite(ruta, otro).hash_config

    assert base != cambiada


def test_chat_local_no_duplica_los_umbrales_y_declara_el_corpus_de_la_ingesta_de_l1d_119():
    crudo = yaml.safe_load(CONFIG_LOCAL.read_text(encoding="utf-8"))

    config = cargar_config_suite(CONFIG_LOCAL, UMBRALES_DEL_ENTORNO)

    assert "umbrales" not in crudo
    assert config.umbrales.rerank_top_n == 9
    assert config.corpus_declarado is not None and "l1d-119" in config.corpus_declarado


def test_main_termina_con_codigo_2_nombrando_las_variables_cuando_chat_local_no_encuentra_los_umbrales(  # noqa: E501
    capsys: pytest.CaptureFixture[str],
):
    codigo = chat.main(["--config", str(CONFIG_LOCAL)], entorno={})

    err = capsys.readouterr().err
    assert codigo == 2
    assert "RELEVANCE_THRESHOLD" in err and "NLI_ENTAILMENT_THRESHOLD" in err


@pytest.mark.ac("US-269", 5)
@pytest.mark.ac("US-269", 6)
def test_main_publica_ambos_conteos_en_cero_y_termina_con_codigo_0_cuando_las_peticiones_preparadas_no_traen_nada_prohibido(  # noqa: E501
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
):
    directorio = _peticiones_preparadas(tmp_path)

    codigo = chat.main(["--config", str(CONFIG), "--peticiones", str(directorio)])

    metricas = json.loads(capsys.readouterr().out)["metricas"]
    assert metricas["salidas_prescriptivas"] == 0
    assert metricas["apariciones_de_identidad"] == {"estado_del_hilo": 0, "logs": 0}
    assert codigo == 0


@pytest.mark.ac("US-269", 5)
@pytest.mark.ac("US-269", 6)
def test_main_termina_con_codigo_distinto_de_cero_y_publica_ambos_conteos_cuando_el_filtro_de_rn_23_esta_desactivado(  # noqa: E501
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
):
    directorio = _peticiones_preparadas(tmp_path)

    codigo = chat.main(
        ["--config", str(CONFIG), "--peticiones", str(directorio)],
        puertos=chat.PuertosDeChat(verificador_terminos=NoFiltra()),
    )

    metricas = json.loads(capsys.readouterr().out)["metricas"]
    assert metricas["salidas_prescriptivas"] >= 1
    assert metricas["apariciones_de_identidad"] == {"estado_del_hilo": 0, "logs": 0}
    assert codigo != 0


@pytest.mark.ac("US-269", 5)
@pytest.mark.ac("US-269", 6)
def test_main_termina_con_codigo_distinto_de_cero_y_publica_ambos_conteos_cuando_la_peticion_preparada_trae_la_identidad(  # noqa: E501
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
):
    directorio = _peticiones_preparadas(tmp_path)
    ruta = directorio / f"{CASO_PII}.json"
    crudo = json.loads(ruta.read_text(encoding="utf-8"))
    nombre = chat.identidad_de_prueba()[0]
    crudo["peticion"]["question"] = f"La paciente {nombre}, ¿cuál es su situación actual?"
    ruta.write_text(json.dumps(crudo, ensure_ascii=False), encoding="utf-8")

    codigo = chat.main(["--config", str(CONFIG), "--peticiones", str(directorio)])

    metricas = json.loads(capsys.readouterr().out)["metricas"]
    assert metricas["salidas_prescriptivas"] == 0
    assert metricas["apariciones_de_identidad"]["estado_del_hilo"] >= 1
    assert codigo != 0


def _con_la_pregunta_enmascarada_como_clinical_api(
    peticiones: dict[str, chat.PeticionDeChat],
) -> dict[str, chat.PeticionDeChat]:
    cambiada = peticiones[CASO_PII].peticion.model_copy(
        update={"question": MASCARA_DE_CLINICAL_API}
    )
    return {**peticiones, CASO_PII: dataclasses.replace(peticiones[CASO_PII], peticion=cambiada)}


def test_evaluar_chat_mide_el_control_de_identidad_solo_por_no_fuga_cuando_el_enrutador_lo_manda_a_fuera_de_alcance():  # noqa: E501
    dataset = cargar_dataset_de_chat(CHAT_V1)
    config = cargar_config_suite(CONFIG)
    peticiones = _con_la_pregunta_enmascarada_como_clinical_api(
        chat.peticiones_de_ejemplo(dataset, config)
    )

    reporte = _correr(peticiones=peticiones)

    control = next(c for c in reporte["por_caso"] if c["id"] == CASO_PII)
    assert control["intent"] == "fuera_de_alcance"
    assert control["control_de_identidad"] is True and control["intent_correcto"] is None
    assert reporte["metricas"]["exactitud_de_intent"] == 1.0
    assert reporte["metricas"]["por_tipo"]["mama"]["hechos_presentes"] == 1.0
    assert reporte["metricas"]["apariciones_de_identidad"] == {"estado_del_hilo": 0, "logs": 0}
