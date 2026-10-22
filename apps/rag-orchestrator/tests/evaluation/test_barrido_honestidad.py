"""Honestidad del informe del barrido (Gate 2, ronda 3): ``fijado`` es el resultado, no la intención; el corte top-N."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.domain.relevance import corte_para_el_generador
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.corrida_barrido import config_con_umbral
from app.evaluation.esquema_suite import ESQUEMA_SUITE
from app.evaluation.reporte import Huella
from tests.evaluation.test_barrido_aceptacion import config_de_barrido, filas_de_la_tabla
from tests.evaluation.test_barrido_gate2 import barrer_con


def test_fijar_con_una_configuracion_que_no_calza_devuelve_2_y_ningun_informe_afirma_fijado(
    tmp_path: Path,
) -> None:
    config = config_de_barrido(tmp_path)
    crudo = yaml.safe_load(config.read_text(encoding="utf-8"))
    config.write_text(yaml.safe_dump(crudo, default_flow_style=True), encoding="utf-8")
    antes = config.read_bytes()

    codigo = barrer_con(tmp_path, config, "--fijar", directorio_de_configs=tmp_path)

    informes = [tmp_path / "salida" / n for n in ("S1-baseline.md", "S1-baseline.json")]
    assert codigo == 2
    assert config.read_bytes() == antes
    assert [
        a
        for a in informes
        if a.exists() and "fijado en la configuración" in a.read_text(encoding="utf-8")
    ] == []


def test_config_con_umbral_admite_notacion_cientifica_sin_corromper_el_yaml() -> None:
    texto = "umbrales:\n  relevance_threshold: 5e-1 # comentario\n  nli_entailment_threshold: 0.7\n"

    nuevo = config_con_umbral(texto, 0.9)

    assert yaml.safe_load(nuevo)["umbrales"] == {
        "relevance_threshold": 0.9,
        "nli_entailment_threshold": 0.7,
    }
    assert "# comentario" in nuevo


@pytest.mark.parametrize(
    "texto",
    [
        "umbrales: {relevance_threshold: 0.5}\n",
        "umbrales: {}\n",
        "a:\n  relevance_threshold: 1\nb:\n  relevance_threshold: 2\n",
    ],
)
def test_config_con_umbral_rechaza_los_estilos_que_no_puede_reescribir(texto: str) -> None:
    with pytest.raises(ConfigInvalida):
        config_con_umbral(texto, 0.9)


def test_fijar_correcto_deja_en_la_configuracion_el_umbral_elegido(tmp_path: Path) -> None:
    config = config_de_barrido(tmp_path)

    codigo = barrer_con(tmp_path, config, "--fijar", directorio_de_configs=tmp_path)

    assert codigo == 0
    assert cargar_config_suite(config).umbrales.relevance_threshold == 0.9


def test_corte_para_el_generador_recorta_a_top_n_antes_de_aplicar_el_umbral() -> None:
    ordenados = [0.9, 0.8, 0.7, 0.6]

    entregados = corte_para_el_generador(ordenados, top_n=2, umbral=0.5, puntaje=lambda p: p)

    assert entregados == [0.9, 0.8]
    assert corte_para_el_generador(ordenados, top_n=3, umbral=0.75, puntaje=lambda p: p) == [
        0.9,
        0.8,
    ]


def test_fijar_sin_directorio_inyectado_se_niega_para_una_configuracion_fuera_de_eval_configs(
    tmp_path: Path,
) -> None:
    config = config_de_barrido(tmp_path)
    antes = config.read_bytes()

    codigo = barrer_con(tmp_path, config, "--fijar")

    assert (codigo, config.read_bytes()) == (2, antes)


def test_un_valor_desconocido_de_sweep_devuelve_2(tmp_path: Path) -> None:
    from app.evaluation.evaluate import main
    from tests.support.fakes import RelojFijo

    codigo = main(
        ["--config", str(config_de_barrido(tmp_path)), "--sweep", "otra_cosa"], reloj=RelojFijo()
    )

    assert codigo == 2


def test_el_esquema_de_la_suite_exige_una_huella_para_el_hash_de_la_configuracion() -> None:
    assert isinstance(ESQUEMA_SUITE.campos["configuracion"].campos["hashConfig"], Huella)


def test_el_informe_rotula_el_recall_del_total_como_tras_reranker_y_el_del_barrido_tras_umbral(
    tmp_path: Path,
) -> None:
    config = config_de_barrido(tmp_path)
    assert barrer_con(tmp_path, config, directorio_de_configs=tmp_path) == 0
    informe = (tmp_path / "salida" / "S1-baseline.md").read_text(encoding="utf-8")

    assert "recall@10 tras umbral" in informe
    assert "| recall@10 (tras reranker) |" in informe
    assert len(filas_de_la_tabla(informe)) == 4


def test_el_procedimiento_real_nunca_sobrescribe_el_baseline_de_la_ci() -> None:
    from app.evaluation.informe_baseline import PROCEDIMIENTO_REAL

    assert "--nombre-archivo baseline.json" not in PROCEDIMIENTO_REAL
    assert "data/evaluation" not in PROCEDIMIENTO_REAL
    assert "S1-reporte-real.json" in PROCEDIMIENTO_REAL
