"""Vuelta 1 del Gate 2 de la familia `opciones` (US-140): una sola regla de excluyentes, fallo cerrado, alcance de la
revisión humana y RN-24 (un análisis previo nunca es cita ni soporte)."""

from __future__ import annotations

import asyncio
import json
import shutil
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.domain.applicability_order import contar_excluyentes_no_coincide
from app.evaluation.config_opciones import cargar_config_opciones
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.corrida import evaluar_pregunta_en_servicio
from app.evaluation.corrida_opciones import (
    MedicionDeOpciones,
    PuertosDeOpciones,
    criterios_evaluados_del_contrato,
    fuente_evaluada,
    medir_opciones,
    ordenable_de,
    servicio_de_la_familia,
    solicitud_del_caso,
)
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.dataset_opciones import cargar_dataset_opciones
from app.evaluation.envoltorios import pico_rss_mib
from app.evaluation.evaluate import main
from app.evaluation.metricas.opciones_mostradas import AnalisisDeOpciones, OpcionMostrada
from app.evaluation.metricas.orden_opciones import OpcionOrdenable
from app.evaluation.modelos_locales import OrigenLocal
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.evaluation.test_opciones_aceptacion import consulta
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "opciones-fake.yaml"
DATASET = RAIZ_REPO / "data" / "evaluation" / "opciones"
REVISION = {"rol": "oncologo", "fecha": "2026-11-03"}


def correr(salida: Path, config: Path = CONFIG, puertos: PuertosDeOpciones | None = None) -> int:
    return main(
        ["--config", str(config), "--suite", "opciones", "--salida", str(salida)],
        reloj=RelojFijo(),
        puertos_opciones=puertos,
    )


def reporte_de(salida: Path) -> dict[str, Any]:
    return json.loads(sorted(salida.glob("*.json"))[0].read_text(encoding="utf-8"))


def copia_del_dataset(tmp_path: Path) -> Path:
    destino = tmp_path / "dataset"
    shutil.copytree(DATASET, destino)
    return destino


def config_para(tmp_path: Path, dataset: Path) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["dataset"]["ruta"] = str(dataset)
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")
    return ruta


def preguntas_con(dataset: Path, valores: dict[str, Any]) -> None:
    ruta = dataset / "preguntas.yaml"
    crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    for pregunta in crudo["preguntas"]:
        if pregunta["id"] in valores:
            pregunta["revisada_por_oncologo"] = valores[pregunta["id"]]
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")


def opcion(identificador: str = "o1", **cambios: Any) -> OpcionMostrada:
    base: dict[str, Any] = {
        "id": identificador,
        "documentos": ("doc-a1",),
        "cita_a_chunk_entregado": True,
        "soporte_nli": True,
        "ordenable": OpcionOrdenable(identificador, 0, 2, 1.0, False),
    }
    return OpcionMostrada(**{**base, **cambios})


def medicion_con(caso: AnalisisDeOpciones) -> PuertosDeOpciones:
    medida = MedicionDeOpciones((caso,), (consulta(),), "test-lista")
    return PuertosDeOpciones(medidor=lambda config, dataset: medida)


def analisis(*opciones: OpcionMostrada) -> AnalisisDeOpciones:
    return AnalisisDeOpciones("OP-04", False, opciones, ("doc-a1",), False, 0, 0, ())


# --- Mayor 1: una sola regla de excluyentes --------------------------------------------------------------------------


@pytest.mark.ac("US-140", 2)
def test_opciones_excluyentes_de_cada_opcion_son_los_que_cuenta_la_funcion_del_dominio_cuando_hay_her2_excluyente() -> (
    None
):
    config = cargar_config_opciones(CONFIG, cargar_config_suite(CONFIG, {}))
    dataset = cargar_dataset_opciones(config.suite.dataset)
    servicio = servicio_de_la_familia(
        config, dataset, RelojFijo(), OrigenLocal({}, None, pico_rss_mib)
    )
    pregunta = next(p for p in dataset.base.preguntas if p.id == "OP-02")
    base = solicitud_del_caso(dataset.contextos[dataset.caso_de("OP-02").paciente])

    _, respuesta = asyncio.run(
        evaluar_pregunta_en_servicio(servicio, dataset.base, base, pregunta, 0, config.max_options)
    )

    por_fuente = {f.externalId: f for f in respuesta.applicability}
    esperados = []
    for posicion, opcion_mostrada in enumerate(respuesta.evidenceOptions, 1):
        fuente = por_fuente[opcion_mostrada.perSource[0].externalId]
        esperado = contar_excluyentes_no_coincide(criterios_evaluados_del_contrato(fuente))
        esperados.append(esperado)
        ordenable = ordenable_de(respuesta.applicability, opcion_mostrada, f"o{posicion}")
        assert ordenable.excluyentes_no_coincide == esperado
    assert esperados == [0, 0, 1]


# --- P2#2: falla cerrado ---------------------------------------------------------------------------------------------


@pytest.mark.ac("US-140", 2)
def test_opciones_fuente_evaluada_es_falsa_cuando_la_fuente_mas_aplicable_no_esta_en_applicability() -> (
    None
):
    config = cargar_config_opciones(CONFIG, cargar_config_suite(CONFIG, {}))
    dataset = cargar_dataset_opciones(config.suite.dataset)
    servicio = servicio_de_la_familia(
        config, dataset, RelojFijo(), OrigenLocal({}, None, pico_rss_mib)
    )
    pregunta = next(p for p in dataset.base.preguntas if p.id == "OP-03")
    base = solicitud_del_caso(dataset.contextos[dataset.caso_de("OP-03").paciente])
    _, respuesta = asyncio.run(
        evaluar_pregunta_en_servicio(servicio, dataset.base, base, pregunta, 0, config.max_options)
    )
    primera = respuesta.evidenceOptions[0]

    assert fuente_evaluada(respuesta.applicability, primera)
    assert not fuente_evaluada([], primera)


@pytest.mark.ac("US-140", 2)
def test_opciones_bloquea_con_3_nombrando_la_opcion_cuando_su_fuente_no_esta_evaluada(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo = correr(tmp_path, puertos=medicion_con(analisis(opcion("o1", fuente_evaluada=False))))

    assert codigo == 3
    assert reporte_de(tmp_path)["invariantes"]["violaciones"] == [
        {"invariante": "RN-28", "caso": "OP-04", "detalle": "o1+sin_fuente_en_applicability"}
    ]
    assert "RN-28 en OP-04" in capsys.readouterr().err


# --- Mayor 3: alcance de la revisión humana --------------------------------------------------------------------------


def test_dataset_rechaza_un_caso_revisado_sin_rol_ni_fecha(tmp_path: Path) -> None:
    dataset = copia_del_dataset(tmp_path)
    preguntas_con(dataset, {"OP-01": True})

    with pytest.raises(DatasetInvalido, match="revisada_por_oncologo"):
        cargar_dataset_opciones(dataset)


def test_dataset_rechaza_una_revision_con_nombre_de_persona(tmp_path: Path) -> None:
    dataset = copia_del_dataset(tmp_path)
    preguntas_con(dataset, {"OP-01": {**REVISION, "nombre": "alguien"}})

    with pytest.raises(DatasetInvalido, match="revisada_por_oncologo"):
        cargar_dataset_opciones(dataset)


def test_dataset_acepta_la_revision_con_rol_y_fecha(tmp_path: Path) -> None:
    dataset = copia_del_dataset(tmp_path)
    preguntas_con(dataset, {"OP-01": REVISION})

    assert cargar_dataset_opciones(dataset).base.revisadas == frozenset({"OP-01"})


@pytest.mark.ac("US-140", 5)
def test_opciones_reporte_declara_que_la_revision_alcanza_solo_a_las_preguntas(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    dataset = copia_del_dataset(tmp_path)
    preguntas_con(dataset, {"OP-01": REVISION, "OP-02": REVISION})

    codigo = correr(tmp_path / "s", config_para(tmp_path, dataset))

    assert codigo == 0
    assert reporte_de(tmp_path / "s")["alcance_de_la_revision"] == "preguntas"
    assert (
        "preguntas revisadas por el oncólogo: 2 de 12; las fuentes esperadas y el orden no están "
        "revisados clínicamente" in capsys.readouterr().out
    )


# --- Pregunta RN-24 ---------------------------------------------------------------------------------------------------


def test_dataset_a_m2_trae_un_analisis_previo_rotulado_no_citable() -> None:
    dataset = cargar_dataset_opciones(DATASET)

    previos = dataset.contextos["a-m2"]["priorAnalyses"]
    assert previos and all(p["citable"] is False for p in previos)


@pytest.mark.ac("US-140", 2)
def test_opciones_ninguna_opcion_de_a_m2_cita_ni_se_apoya_en_el_analisis_previo() -> None:
    config = cargar_config_opciones(CONFIG, cargar_config_suite(CONFIG, {}))
    dataset = cargar_dataset_opciones(config.suite.dataset)

    medido = asyncio.run(
        medir_opciones(config, dataset, RelojFijo(), OrigenLocal({}, None, pico_rss_mib))
    )

    de_a_m2 = [a for a in medido.analisis if dataset.caso_de(a.caso).paciente == "a-m2"]
    assert {a.caso for a in de_a_m2} == {"OP-04", "OP-06"}
    assert all(not o.memoria_citada for a in de_a_m2 for o in a.opciones)


@pytest.mark.ac("US-140", 2)
def test_opciones_bloquea_con_3_nombrando_rn_24_cuando_una_opcion_cita_un_analisis_previo(
    tmp_path: Path,
) -> None:
    codigo = correr(tmp_path, puertos=medicion_con(analisis(opcion("o1", memoria_citada=True))))

    assert codigo == 3
    assert reporte_de(tmp_path)["invariantes"]["violaciones"] == [
        {"invariante": "RN-24", "caso": "OP-04", "detalle": "o1"}
    ]


@pytest.mark.ac("US-140", 2)
def test_opciones_descarta_la_opcion_que_cita_el_analisis_previo_y_no_bloquea_cuando_el_generador_la_propone(
    tmp_path: Path,
) -> None:
    """Inyector: el generador falso propone una opción que cita el análisis previo como si fuera un chunk."""
    dataset = copia_del_dataset(tmp_path)
    ruta = dataset / "propuestas.yaml"
    crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    crudo["propuestas"]["OP-04"].append(
        {
            "opcion": "Opción PREVIA (test)",
            "justificacion": "Adjuvant chemotherapy alone after surgery is described",
            "citas": ["analisis-previo-1"],
        }
    )
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")
    config = cargar_config_opciones(
        config_para(tmp_path, dataset), cargar_config_suite(config_para(tmp_path, dataset), {})
    )

    medido = asyncio.run(
        medir_opciones(
            config,
            cargar_dataset_opciones(dataset),
            RelojFijo(),
            OrigenLocal({}, None, pico_rss_mib),
        )
    )

    op04 = next(a for a in medido.analisis if a.caso == "OP-04")
    assert len(op04.opciones) == 3
    assert all(not o.memoria_citada for o in op04.opciones)
