"""Reglas pequeñas del proveedor local: percentiles, recursos del NLI, registro de llamadas y guardas (US-233a)."""

from __future__ import annotations

import dataclasses
from pathlib import Path

import pytest

from app.domain.nli import ParNli, ResultadoNli
from app.evaluation.chequeo_config import variables_de_modelos_ausentes
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.cronometro import Cronometro, RelojSimulado, percentil, resumen_de_latencia
from app.evaluation.guardas import SuiteAbortada, exigir_proveedor_local
from app.evaluation.llamadas import (
    LlamadaSaliente,
    RegistroDeLlamadas,
    adaptadores_cubiertos,
    llamadas_a_nube_con_datos_reales,
)
from app.evaluation.medicion_modelos import informe_de_recursos_nli
from app.evaluation.medidores import NliMedido
from tests.evaluation.test_fidelidad_juez import CONFIG
from tests.support.modelos import crear_entorno_de_modelos


def test_el_percentil_usa_el_rango_mas_cercano_y_es_none_sin_muestra() -> None:
    assert percentil([4.0, 1.0, 3.0, 2.0], 0.50) == 2.0
    assert percentil([4.0, 1.0, 3.0, 2.0], 0.95) == 4.0
    assert percentil([7.0], 0.50) == 7.0
    assert percentil([], 0.50) is None


def test_el_resumen_de_latencia_trae_la_muestra_p50_y_p95_y_none_sin_muestra() -> None:
    assert resumen_de_latencia([1.0, 2.0, 3.0, 4.0]) == {"n": 4, "p50_ms": 2.0, "p95_ms": 4.0}
    assert resumen_de_latencia([]) == {"n": 0, "p50_ms": None, "p95_ms": None}


class NliDe:
    version = "nli-de-prueba@1"

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        return [ResultadoNli(label="neutral", p_entailment=0.1) for _ in pares]


def test_el_nli_medido_reparte_el_lote_entre_sus_hipotesis_y_no_cuenta_lotes_vacios() -> None:
    nli = NliMedido(NliDe(), Cronometro(RelojSimulado()))

    nli.clasificar([ParNli("p", "h1"), ParNli("p", "h2"), ParNli("p", "h3"), ParNli("p", "h4")])
    nli.clasificar([])

    assert nli.latencias.por_lote_ms == [1.0]
    assert nli.latencias.por_hipotesis_ms == [0.25] * 4


@pytest.mark.parametrize(("rss", "supera"), [(4488.9, False), (4489.0, False), (4489.1, True)])
def test_el_informe_marca_el_exceso_solo_cuando_el_rss_supera_el_limite(
    rss: float, supera: bool
) -> None:
    informe = informe_de_recursos_nli([2.0, 4.0], [1.0, 1.0, 2.0, 2.0], rss, 4489.0)

    assert informe["supera_el_limite"] is supera
    assert (informe["rss_maximo_mib"], informe["rss_limite_mib"]) == (rss, 4489.0)
    assert informe["latencia_ms"] == {
        "por_lote": {"n": 2, "p50_ms": 2.0, "p95_ms": 4.0},
        "por_hipotesis": {"n": 4, "p50_ms": 1.0, "p95_ms": 2.0},
    }


def test_los_adapters_en_proceso_no_cuentan_como_llamadas_a_la_nube_con_datos_reales() -> None:
    registro = RegistroDeLlamadas()
    registro.registrar_en_proceso("nli", "real_anonimizado", "nli@1")
    registro.registrar("http://127.0.0.1:11434/v1", "real_anonimizado", "g@1", "llm")
    registro.registrar("https://nube.invalid/v1", "real_anonimizado", "g@1", "llm")
    registro.registrar("https://nube.invalid/v1", "sintetico", "g@1", "llm")

    assert llamadas_a_nube_con_datos_reales(registro.llamadas) == 1
    assert adaptadores_cubiertos(registro.llamadas) == ["llm", "nli"]


def test_un_modelo_de_nube_en_un_host_local_cuenta_como_llamada_a_la_nube_con_datos_reales() -> (
    None
):
    llamada = LlamadaSaliente("http://127.0.0.1:11434/v1", "real_anonimizado", "x:cloud", "llm")

    assert llamadas_a_nube_con_datos_reales([llamada]) == 1


def config_local(**cambios: object):
    base = cargar_config_suite(CONFIG, {})
    valores: dict[str, object] = {
        "proveedor": "local",
        "urls": {"llm": "http://127.0.0.1:11434/v1"},
        "llm_modelo": "g@1",
        "rss_limite_mib": 4489.0,
        **cambios,
    }
    return dataclasses.replace(base, **valores)


def test_la_guarda_local_deja_pasar_una_configuracion_local_y_no_hace_nada_con_fake() -> None:
    exigir_proveedor_local(config_local())
    exigir_proveedor_local(
        dataclasses.replace(config_local(), proveedor="fake", urls={"llm": "https://nube.invalid"})
    )


@pytest.mark.parametrize(
    ("cambios", "causa"),
    [
        ({"urls": {}}, "urls.llm"),
        ({"urls": {"llm": "http://127.0.0.1:1/v1", "ocr": "https://nube.invalid"}}, "adapter ocr"),
        ({"llm_modelo": "g:cloud"}, "nube"),
        ({"rss_limite_mib": None}, "rss_limite_mib"),
    ],
)
def test_la_guarda_local_aborta_nombrando_la_causa_y_nunca_el_valor(
    cambios: dict[str, object], causa: str
) -> None:
    with pytest.raises(SuiteAbortada) as error:
        exigir_proveedor_local(config_local(**cambios))

    assert causa in str(error.value)
    assert "nube.invalid" not in str(error.value) and "g:cloud" not in str(error.value)


def test_las_variables_ausentes_de_los_modelos_se_listan_por_nombre(tmp_path: Path) -> None:
    entorno = crear_entorno_de_modelos(tmp_path).con(
        NLI_MODEL_SHA256=None, RERANKER_TOKENIZER_PATH="", NLI_LABEL_INDEX_NEUTRAL=None
    )

    assert variables_de_modelos_ausentes(entorno) == [
        "RERANKER_TOKENIZER_PATH",
        "NLI_MODEL_SHA256",
        "NLI_LABEL_INDEX_NEUTRAL",
    ]
    assert variables_de_modelos_ausentes(crear_entorno_de_modelos(tmp_path).variables) == []
