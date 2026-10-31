"""Arrastres de l1d-244 (4.2) que cierra US-233a: guarda sintética del catálogo en memoria y una sola ficha sintética."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
import yaml

from app.evaluation import config_suite
from app.evaluation.adaptadores_falsos import CoberturaEnMemoria, ficha_sintetica
from app.evaluation.guardas import SuiteAbortada
from tests.evaluation.conftest import RAIZ_REPO

CATALOGO = RAIZ_REPO / "data" / "evaluation" / "aplicabilidad" / "corpus-catalogo.yaml"


def catalogo_con_clase(tmp_path: Path, clase: str | None) -> Path:
    crudo = yaml.safe_load(CATALOGO.read_text(encoding="utf-8"))
    if clase is None:
        del crudo["clase"]
    else:
        crudo["clase"] = clase
    ruta = tmp_path / "catalogo.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


@pytest.mark.parametrize("clase", ["real_anonimizado", "real_identificado", None])
def test_el_catalogo_en_memoria_se_niega_a_cargar_cuando_no_declara_clase_sintetico(
    tmp_path: Path, clase: str | None
) -> None:
    with pytest.raises(SuiteAbortada, match="sintetico"):
        CoberturaEnMemoria(catalogo_con_clase(tmp_path, clase), 3)


def test_el_catalogo_en_memoria_carga_cuando_declara_clase_sintetico() -> None:
    cobertura = CoberturaEnMemoria(CATALOGO, 3).cobertura()

    assert cobertura.vigentes > 0


def test_la_ficha_sintetica_es_publica_y_lleva_las_fechas_y_el_id_recibidos() -> None:
    ficha = ficha_sintetica("doc-1", "Titulo", date(2026, 1, 1))

    assert (ficha.external_id, ficha.title, ficha.published_at, ficha.last_updated_at) == (
        "doc-1",
        "Titulo",
        date(2026, 1, 1),
        date(2026, 1, 1),
    )
    assert ficha.source_name == "Corpus sintético (test)"


def test_los_nombres_de_config_suite_que_importan_otros_modulos_son_publicos() -> None:
    assert hasattr(config_suite, "clave_de") and hasattr(config_suite, "ruta_del_repo")
    assert not hasattr(config_suite, "_clave") and not hasattr(config_suite, "_ruta_del_repo")
