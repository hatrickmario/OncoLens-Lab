"""El conjunto dorado versionado en ``data/evaluation/poblacion-dorado/`` (L1D-299, US-233b AC-1 y AC-8)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.evaluation.config_poblacion import cargar_config_poblacion
from app.evaluation.corrida_poblacion import MedicionSinEvidencia, PuertosDePoblacion
from app.evaluation.dataset_poblacion import cargar_dorado
from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-poblacion.yaml"
DORADO = RAIZ_REPO / "data" / "evaluation" / "poblacion-dorado"


def test_el_dorado_versionado_trae_al_menos_30_pares_estratificados_por_tipo_de_fuente_e_idioma() -> (
    None
):
    config = cargar_config_poblacion(CONFIG)
    dorado = cargar_dorado(DORADO, config.licencias_aceptadas)

    assert len(dorado.pares) >= config.minimo_de_pares_del_dorado
    assert set(dorado.estratos()) == {
        f"{estrato}/{idioma}"
        for estrato in ("guia", "ensayo", "revision")
        for idioma in ("es", "en")
    }
    assert all(p.esperados and all(v.scope and v.chunk for v in p.esperados) for p in dorado.pares)
    assert len(dorado.bucle) >= config.minimo_de_pares_del_bucle
    assert len({e.id for e in dorado.estados}) >= 5  # F-20…F-24


def test_el_manifiesto_del_dorado_declara_licencia_aceptada_por_documento_y_ninguna_fuente_excluida() -> (
    None
):
    config = cargar_config_poblacion(CONFIG)
    manifiesto = json.loads((DORADO / "manifest.json").read_text(encoding="utf-8"))
    dorado = cargar_dorado(DORADO, config.licencias_aceptadas)

    assert set(manifiesto["licencias"]) >= {p.documento for p in dorado.pares}
    assert set(manifiesto["licencias"].values()) <= config.licencias_aceptadas
    contenido = "".join(
        f.read_text(encoding="utf-8").lower() for f in DORADO.iterdir() if f.is_file()
    )
    assert "nccn" not in contenido and "esmo" not in contenido  # RN-21: ni siquiera como ejemplo


def test_el_dorado_semilla_sin_revisor_corre_la_suite_y_queda_no_concluyente(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Mientras el revisor humano no firme el conjunto (l1d-117 2.3) la semilla corre, pero precisión y cobertura quedan
    no concluyentes y nunca PASS. El AC-1 completo (con revisor y fecha) queda pendiente de esa revisión."""
    codigo = main(
        ["--config", str(CONFIG), "--suite", "poblacion", "--salida", str(tmp_path)],
        reloj=RelojFijo(),
        puertos_poblacion=PuertosDePoblacion(lambda _c: MedicionSinEvidencia(1.0, 0)),
    )

    reporte = json.loads(next(tmp_path.glob("*.json")).read_text(encoding="utf-8"))
    assert codigo == 0, capsys.readouterr().err
    assert reporte["configuracion"]["revision"]["completa"] is False
    assert reporte["veredicto"]["resultado"] == "no_concluyente"
    assert reporte["metricas"]["pares_del_dorado"] >= 30
