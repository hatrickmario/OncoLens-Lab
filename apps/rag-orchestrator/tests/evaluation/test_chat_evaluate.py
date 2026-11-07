"""Familia ``chat`` de ``evaluate`` (US-269 AC-3…AC-8, OL-06): ``chat-v1`` sobre el grafo de producción con adapters falsos.

El ``ChatTurnService``, sus nodos, el filtro de RN-23 y el validador de citas son los de producción; solo el LLM (un guion por
caso, FX-12-e), el NLI léxico, el reranker y el corpus son falsos. Solo datos sintéticos (RN-14): el reporte lleva
agregados, nunca texto ni identidad.
"""

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
from app.evaluation.rutas import raiz_repo

CONFIG = raiz_repo() / "apps/rag-orchestrator/eval/configs/chat-fake.yaml"
CHAT_V1 = raiz_repo() / "data" / "eval" / "chat-v1"
CASO_PII = "CHAT-AC01-MAMA-PII"


class NoFiltra:
    """El filtro de RN-23 desactivado (solo para probar que la corrida lo detectaría)."""

    version = "sin-filtro"

    def reglas_coincidentes(self, texto, campo, fuentes):  # noqa: ANN001, ANN201
        return ()


def _correr(dataset=None, peticiones=None, puertos=None):
    config = cargar_config_suite(CONFIG)
    dataset = dataset or cargar_dataset_de_chat(CHAT_V1)
    peticiones = peticiones or chat.peticiones_de_ejemplo(dataset, config)
    return asyncio.run(chat.evaluar(config, dataset, peticiones, puertos=puertos))


def _dataset_con_revision(tmp_path: Path, revision: str):
    destino = tmp_path / "chat-v1"
    shutil.copytree(CHAT_V1, destino)
    ruta = destino / "casos.yaml"
    crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    for caso in crudo["casos"]:
        caso["revision_oncologo"] = revision
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")
    return cargar_dataset_de_chat(destino)


@pytest.mark.ac("US-269", 3)
def test_evaluar_chat_publica_soporte_nli_precision_de_enlaces_y_hechos_presentes_por_tipo_de_cancer_cuando_se_miden_los_casos_ac01_y_ac02():  # noqa: E501
    reporte = _correr()

    por_tipo = reporte["metricas"]["por_tipo"]
    assert set(por_tipo) == {"mama", "prostata"}
    for tipo in ("mama", "prostata"):
        medida = por_tipo[tipo]
        assert medida["soporte_nli"] == 1.0
        assert medida["precision_de_enlaces"] == 1.0
        assert medida["hechos_presentes"] == 1.0
        assert medida["afirmaciones_omitidas"] == 0
    assert reporte["metricas"]["exactitud_de_intent"] == 1.0
    assert reporte["casos"] == 13


@pytest.mark.ac("US-269", 5)
def test_evaluar_chat_publica_cero_salidas_prescriptivas_y_no_muestra_chat_prescriptivo_cuando_el_guion_propone_debe_recibir():  # noqa: E501
    reporte = _correr()

    control = reporte["control_prescriptivo"]
    assert reporte["metricas"]["salidas_prescriptivas"] == 0
    assert control["afirmaciones_omitidas"] >= 1
    assert control["salidas_prescriptivas_mostradas"] == 0
    assert chat.codigo_de_salida(reporte) == 0


@pytest.mark.ac("US-269", 5)
def test_evaluar_chat_sale_con_codigo_distinto_de_cero_cuando_el_filtro_de_rn_23_esta_desactivado():
    reporte = _correr(puertos=chat.PuertosDeChat(verificador_terminos=NoFiltra()))

    assert reporte["metricas"]["salidas_prescriptivas"] >= 1
    assert chat.codigo_de_salida(reporte) != 0


@pytest.mark.ac("US-269", 6)
def test_evaluar_chat_publica_cero_apariciones_de_identidad_en_el_estado_del_hilo_y_los_logs_cuando_corre_el_caso_con_pii():  # noqa: E501
    dataset = cargar_dataset_de_chat(CHAT_V1)
    peticiones = chat.peticiones_de_ejemplo(dataset, cargar_config_suite(CONFIG))
    assert peticiones[CASO_PII].identidad == chat.identidad_de_prueba()

    reporte = _correr(dataset, peticiones)

    assert reporte["metricas"]["apariciones_de_identidad"] == {"estado_del_hilo": 0, "logs": 0}
    texto = json.dumps(reporte, ensure_ascii=False)
    assert all(fragmento not in texto for fragmento in chat.identidad_de_prueba())
    assert "situación actual" not in texto


@pytest.mark.ac("US-269", 6)
def test_evaluar_chat_cuenta_la_identidad_y_sale_con_codigo_distinto_de_cero_cuando_la_peticion_la_trae_sin_enmascarar():  # noqa: E501
    dataset = cargar_dataset_de_chat(CHAT_V1)
    peticiones = chat.peticiones_de_ejemplo(dataset, cargar_config_suite(CONFIG))
    nombre = chat.identidad_de_prueba()[0]
    sin_enmascarar = peticiones[CASO_PII].peticion.model_copy(
        update={"question": f"La paciente {nombre}, ¿cuál es su situación actual?"}
    )
    peticiones[CASO_PII] = dataclasses.replace(peticiones[CASO_PII], peticion=sin_enmascarar)

    reporte = _correr(dataset, peticiones)

    assert reporte["metricas"]["apariciones_de_identidad"]["estado_del_hilo"] >= 1
    assert chat.codigo_de_salida(reporte) != 0


@pytest.mark.ac("US-269", 7)
def test_evaluar_chat_publica_el_p95_por_intencion_sin_cambiar_el_codigo_de_salida_cuando_corre_con_reloj_simulado():  # noqa: E501
    reporte = _correr()

    latencia = reporte["metricas"]["latencia"]
    assert latencia["informativa"] is True
    assert latencia["turno"]["p95_ms"] is not None
    assert set(latencia["por_intencion"]) == {
        "caso",
        "faltantes",
        "evidencia",
        "fuentes_limitaciones",
    }
    assert all(v["p95_ms"] is not None for v in latencia["por_intencion"].values())
    assert chat.codigo_de_salida(reporte) == 0


@pytest.mark.ac("US-269", 8)
def test_evaluar_chat_no_rotula_validada_ninguna_metrica_y_lista_los_pendientes_cuando_ningun_caso_esta_aprobado():  # noqa: E501
    dataset = cargar_dataset_de_chat(CHAT_V1)
    reporte = _correr(dataset)

    revision = reporte["metricas"]["revision_clinica"]
    assert revision["rotulo"] == "no_validada"
    assert sorted(revision["pendientes"]) == sorted(c.id for c in dataset.casos)
    assert chat.codigo_de_salida(reporte) == 0


@pytest.mark.ac("US-269", 8)
def test_evaluar_chat_rotula_validada_cuando_todos_los_casos_estan_aprobados(tmp_path: Path):
    reporte = _correr(_dataset_con_revision(tmp_path, "aprobado"))

    revision = reporte["metricas"]["revision_clinica"]
    assert revision["rotulo"] == "validada"
    assert revision["pendientes"] == []
