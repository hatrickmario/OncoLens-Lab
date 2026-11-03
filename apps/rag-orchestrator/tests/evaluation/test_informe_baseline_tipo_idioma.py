"""El informe del baseline por tipo de cáncer e idioma (US-120 AC-6): celdas «no medida», OUT-08 y esquema cerrado."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace

from app.evaluation.barrido import Eleccion, FilaBarrido
from app.evaluation.informe_baseline import (
    ESQUEMA_BASELINE,
    DatosDelInforme,
    agregados_del_informe,
    renderizar_informe,
)
from app.evaluation.metas import cargar_metas
from app.evaluation.reporte import validar_esquema_cerrado
from tests.evaluation.conftest import RAIZ_APP

METAS = cargar_metas(RAIZ_APP / "eval" / "configs" / "metas-iniciales.yaml")
EN_META = {
    "recall_at_10": 0.9,
    "recall_at_10_es_a_en": 0.8,
    "mrr": 0.7,
    "fidelidad_proxy": 0.95,
    "precision_citas": 0.95,
    "sin_evidencia": 0.95,
}


def datos(
    totales: Mapping[str, float | None], por_tipo_e_idioma: Mapping[str, Mapping[str, object]]
) -> DatosDelInforme:
    return DatosDelInforme(
        clase_dataset="sintetico",
        proveedor="local",
        dataset="fx-t5a-a@1",
        hash_config="a" * 64,
        umbral_de_referencia=0.3,
        tolerancia_recall=0.05,
        filas=[FilaBarrido(0.3, 0.95, 0.9)],
        eleccion=Eleccion(0.3, "regla D1"),
        fijado=False,
        metricas_totales=totales,
        metricas_por_cancer={},
        metas=METAS,
        p95_e2e_s=None,
        metricas_por_tipo_e_idioma=por_tipo_e_idioma,  # type: ignore[arg-type]
        p95_corridas=3,
    )


CELDAS = {
    "mama": {"es": EN_META, "en": EN_META, "es_a_en": EN_META},
    "prostata": {"es": None, "en": EN_META, "es_a_en": None},
}


def test_una_celda_sin_consultas_se_informa_como_no_medida_y_no_como_cero() -> None:
    informe = renderizar_informe(datos(EN_META, CELDAS))

    assert "| próstata · es | no medida | — | — |" in informe
    assert "0.000" not in informe


def test_cada_metrica_de_una_celda_se_marca_en_meta_o_fuera_de_meta_sin_tocar_las_metas() -> None:
    celdas = {"mama": {"es": {**EN_META, "recall_at_10": 0.5}, "en": None, "es_a_en": None}}

    informe = renderizar_informe(datos(EN_META, celdas))

    assert "| mama · es · recall@10 (tras reranker) | 0.500 | ≥ 0.8 | fuera de meta |" in informe


def test_la_fidelidad_fuera_de_meta_anade_la_valoracion_de_out_08_sin_implementarla() -> None:
    informe = renderizar_informe(datos({**EN_META, "fidelidad_proxy": 0.80}, CELDAS))

    assert "OUT-08" in informe
    assert "contexto del fragmento" in informe and "NLI más fuerte" in informe


def test_la_fidelidad_en_meta_no_anade_la_seccion_de_out_08() -> None:
    assert "OUT-08" not in renderizar_informe(datos(EN_META, CELDAS))


def test_la_fidelidad_sin_medir_no_anade_la_seccion_de_out_08() -> None:
    assert "OUT-08" not in renderizar_informe(datos({**EN_META, "fidelidad_proxy": None}, CELDAS))


def test_los_agregados_con_celdas_nulas_cumplen_el_esquema_cerrado() -> None:
    agregados = agregados_del_informe(datos(EN_META, CELDAS))

    validar_esquema_cerrado(agregados, ESQUEMA_BASELINE)
    assert agregados["metricasPorTipoEIdioma"]["prostata"]["es"] is None
    assert agregados["p95Corridas"] == 3


def _con_p95(origen: str, corridas: int | None) -> DatosDelInforme:
    return replace(
        datos(EN_META, CELDAS), p95_e2e_s=2.5, p95_origen=origen, p95_corridas=corridas
    )


def test_el_p95_pasado_por_la_linea_de_comandos_se_declara_una_medicion_externa() -> None:
    informe = renderizar_informe(_con_p95("medicion_externa", None))

    assert "p95 medido de punta a punta: 2.5 s (una medición externa)" in informe
    assert "corridas" not in informe.split("## 3.")[1].split("##")[0]


def test_el_p95_en_proceso_declara_la_etapa_consulta_y_las_corridas_y_no_dice_punta_a_punta() -> None:
    informe = renderizar_informe(_con_p95("corridas_en_proceso", 5))

    seccion = informe.split("## 3.")[1].split("\n## ")[0]
    assert "etapa `consulta`" in seccion and "mediana de 5 corridas" in seccion
    assert "medido de punta a punta" not in seccion


def test_un_p95_sin_corridas_declaradas_no_inventa_un_numero_de_corridas() -> None:
    informe = renderizar_informe(_con_p95("corridas_en_proceso", None))

    seccion = informe.split("## 3.")[1].split("\n## ")[0]
    assert "corridas no declaradas" in seccion and "3 corridas" not in seccion
