"""Unitarios de las piezas puras de la suite `evaluate`: cronómetro, métricas, configuración y dataset."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.cronometro import Cronometro, RelojSimulado, percentil_95
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio
from app.evaluation.metricas.citas import precision_de_citas
from app.evaluation.metricas.opciones import porcentaje_con_cita_y_soporte
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.metricas.sin_evidencia import exactitud_sin_evidencia
from app.evaluation.retrieval_metrics import ResultadoPregunta
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
FX = RAIZ_REPO / "data" / "eval" / "fx-t5a-a"


def consulta(**cambios: object) -> ResultadoConsulta:
    base = ResultadoPregunta("q", "cualquiera", "es", True, False, "mama", "", (), 1.0, 1.0, None)
    valores: dict[str, object] = {
        "recuperacion": base,
        "revisada": False,
        "esperaba_sin_evidencia": False,
        "sin_evidencia": False,
        "generador_invocado": True,
        "top_relevance_score": 0.9,
        "citas_propuestas": 0,
        "citas_validas": 0,
        "opciones_mostradas": 0,
        "opciones_descartadas": 0,
    }
    valores.update(cambios)
    return ResultadoConsulta(**valores)  # type: ignore[arg-type]


def test_percentil_95_devuelve_none_cuando_no_hay_valores() -> None:
    assert percentil_95([]) is None


def test_percentil_95_devuelve_el_rango_mas_cercano() -> None:
    assert percentil_95([float(i) for i in range(1, 21)]) == 19.0


def test_el_cronometro_mide_un_milisegundo_por_etapa_con_el_reloj_simulado() -> None:
    cronometro = Cronometro(RelojSimulado())

    cronometro.medir("busqueda", lambda: None)

    assert cronometro.p95_ms()["busqueda"] == 1.0
    assert cronometro.p95_ms()["nli"] is None


def test_la_precision_de_citas_es_none_cuando_nadie_cita() -> None:
    assert precision_de_citas([consulta()]) == {"precision": None, "n": 0}


def test_la_precision_de_citas_cuenta_las_citas_a_chunks_recuperados() -> None:
    resultado = precision_de_citas([consulta(citas_propuestas=4, citas_validas=3)])

    assert resultado == {"precision": 0.75, "n": 4}


def test_sin_evidencia_con_top_score_cero_viola_rn02_porque_null_no_es_cero() -> None:
    violada = consulta(
        esperaba_sin_evidencia=True,
        sin_evidencia=True,
        generador_invocado=False,
        top_relevance_score=0.0,
    )

    assert exactitud_sin_evidencia([violada])["violaciones_rn02"] == 1


def test_sin_evidencia_con_llm_invocado_viola_rn02() -> None:
    violada = consulta(esperaba_sin_evidencia=True, sin_evidencia=True, top_relevance_score=None)

    assert exactitud_sin_evidencia([violada])["violaciones_rn02"] == 1


def test_la_exactitud_de_sin_evidencia_cuenta_los_dos_sentidos() -> None:
    acierta = consulta(
        esperaba_sin_evidencia=True,
        sin_evidencia=True,
        generador_invocado=False,
        top_relevance_score=None,
    )
    falla = consulta(
        esperaba_sin_evidencia=False,
        sin_evidencia=True,
        generador_invocado=False,
        top_relevance_score=None,
    )

    assert exactitud_sin_evidencia([acierta, falla])["exactitud"] == 0.5


def test_el_porcentaje_de_opciones_es_none_sin_opciones() -> None:
    assert porcentaje_con_cita_y_soporte([consulta()]) == {"porcentaje": None, "n": 0}


def test_el_porcentaje_de_opciones_mide_mostradas_sobre_propuestas() -> None:
    resultado = porcentaje_con_cita_y_soporte(
        [consulta(opciones_mostradas=3, opciones_descartadas=1)]
    )

    assert resultado == {"porcentaje": 0.75, "n": 4}


def test_la_huella_cambia_cuando_cambia_un_valor_de_la_configuracion(tmp_path: Path) -> None:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["umbrales"]["relevance_threshold"] = 0.31
    otra = tmp_path / "otra.yaml"
    otra.write_text(yaml.safe_dump(crudo), encoding="utf-8")

    assert cargar_config_suite(otra).hash_config != cargar_config_suite(CONFIG).hash_config


def test_la_configuracion_sin_una_clave_obligatoria_se_rechaza(tmp_path: Path) -> None:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    del crudo["umbrales"]
    rota = tmp_path / "rota.yaml"
    rota.write_text(yaml.safe_dump(crudo), encoding="utf-8")

    with pytest.raises(ConfigInvalida):
        cargar_config_suite(rota)


def test_fx_t5a_a_trae_seis_preguntas_cuatro_textos_pii_y_dos_salidas_prescriptivas() -> None:
    dataset = FuenteDatasetEnDirectorio(FX).cargar()

    assert (
        len(dataset.preguntas),
        sum(p.idioma == "es" for p in dataset.preguntas),
        sum(p.modo_acierto == "sin_evidencia" for p in dataset.preguntas),
        len(dataset.textos_pii),
        len(dataset.salidas_prescriptivas),
        any(c.id == "ch-inj-1" for c in dataset.chunks),
    ) == (6, 3, 2, 4, 2, True)


def test_un_manifiesto_sin_clase_se_rechaza(tmp_path: Path) -> None:
    manifiesto = tmp_path / "manifest.yaml"
    manifiesto.write_text("nombre: x\n", encoding="utf-8")

    with pytest.raises(DatasetInvalido):
        FuenteDatasetEnDirectorio(tmp_path).cargar()
