"""Meta inicial ``paraphrase_evidence_min_ratio`` (US-277 AC-2, RN-22): vive en ``metas-iniciales.yaml`` y no ensucia los informes
que no la miden (el baseline tiene un esquema cerrado de métricas)."""

from __future__ import annotations

from app.evaluation.metas import Meta, cargar_metas, marcar_frente_a_meta
from tests.evaluation.conftest import RAIZ_APP

METAS = RAIZ_APP / "eval" / "configs" / "metas-iniciales.yaml"


def test_la_meta_de_parafrasis_con_evidencia_es_un_minimo_inicial_de_ochenta_por_ciento_en_configuracion() -> (
    None
):
    metas = cargar_metas(METAS)

    assert metas["paraphrase_evidence_min_ratio"].minimo == 0.80
    assert metas["paraphrase_evidence_min_ratio"].maximo is None


def test_no_marca_una_meta_cuando_el_informe_no_declara_su_metrica() -> None:
    metas = {"recall_at_10": Meta("r", minimo=0.8), "otra": Meta("o", minimo=0.5)}

    marcas = marcar_frente_a_meta({"recall_at_10": 0.9}, metas)

    assert [m.clave for m in marcas] == ["recall_at_10"]


def test_marca_sin_medir_una_meta_cuando_el_informe_declara_su_metrica_sin_valor() -> None:
    marcas = marcar_frente_a_meta({"recall_at_10": None}, {"recall_at_10": Meta("r", minimo=0.8)})

    assert [(m.clave, m.estado) for m in marcas] == [("recall_at_10", "sin medir")]
