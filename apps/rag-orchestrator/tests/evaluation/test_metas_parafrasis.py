"""Meta inicial ``paraphrase_evidence_min_ratio`` (US-277 AC-2, RN-22): vive en ``metas-iniciales.yaml`` y no ensucia los informes
que no la miden (el baseline tiene un esquema cerrado de métricas)."""

from __future__ import annotations

from app.evaluation.informe_baseline import agregados_del_informe, renderizar_informe
from app.evaluation.metas import Meta, cargar_metas, marcar_frente_a_meta
from tests.evaluation.conftest import RAIZ_APP
from tests.evaluation.test_informe_baseline_tipo_idioma import EN_META, datos

METAS = RAIZ_APP / "eval" / "configs" / "metas-iniciales.yaml"


def test_la_meta_de_parafrasis_con_evidencia_es_un_minimo_inicial_de_ochenta_por_ciento_en_configuracion() -> (
    None
):
    metas = cargar_metas(METAS)

    assert metas["paraphrase_evidence_min_ratio"].minimo == 0.80
    assert metas["paraphrase_evidence_min_ratio"].maximo is None


def test_marca_sin_medir_una_meta_cuando_las_metricas_no_traen_su_clave() -> None:
    metas = {"recall_at_10": Meta("r", minimo=0.8), "otra": Meta("o", minimo=0.5)}

    marcas = marcar_frente_a_meta({"recall_at_10": 0.9}, metas)

    assert [(m.clave, m.estado) for m in marcas] == [
        ("recall_at_10", "en meta"),
        ("otra", "sin medir"),
    ]


def test_el_baseline_no_incluye_la_meta_de_parafrasis_porque_no_la_mide() -> None:
    informe = agregados_del_informe(datos(EN_META, {}))

    assert "paraphrase_evidence_min_ratio" not in [m["metrica"] for m in informe["metricas"]]
    assert "paráfrasis" not in renderizar_informe(datos(EN_META, {}))
