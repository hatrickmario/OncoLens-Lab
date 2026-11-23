"""Configuración, dataset y formas de los términos de la familia `contextual` (US-271 AC-9, L1D-329): sin valores por defecto en
código (RN-22) y un único punto que da las formas de un término (design D4)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.evaluation.corrida_contextual import formas_del_termino, seudonimo_de_la_suite
from app.evaluation.evaluate import main
from tests.evaluation.mundo_contextual import Mundo, construir_mundo
from tests.support.contract import CATALOGOS
from tests.support.fakes import RelojFijo


def _correr(mundo: Mundo, salida: Path) -> int:
    return main(
        ["--config", str(mundo.config), "--suite", "contextual", "--salida", str(salida)],
        reloj=RelojFijo(),
        puertos_contextual=mundo.puertos,
    )


def _con_contextual(mundo: Mundo, cambios: dict[str, Any]) -> None:
    config = yaml.safe_load(mundo.config.read_text("utf-8"))
    for clave, valor in cambios.items():
        if valor is None:
            del config["contextual"][clave]
        else:
            config["contextual"][clave] = valor
    mundo.config.write_text(yaml.safe_dump(config, allow_unicode=True), encoding="utf-8")


@pytest.mark.parametrize(
    "clave",
    [
        "casos",
        "casos_ruta",
        "expansion_habilitada",
        "preguntas_de_sinonimos",
        "genericas_con_evidencia_minimo",
    ],
)
def test_la_configuracion_se_rechaza_con_codigo_2_nombrando_la_clave_cuando_falta(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], clave: str
) -> None:
    mundo = construir_mundo(tmp_path)
    _con_contextual(mundo, {clave: None})

    codigo = _correr(mundo, tmp_path / "salida")

    assert codigo == 2
    assert f"contextual.{clave}" in capsys.readouterr().err
    assert not (tmp_path / "salida").exists()


@pytest.mark.parametrize(
    ("cambio", "clave"),
    [
        ({"expansion_habilitada": "si"}, "contextual.expansion_habilitada"),
        ({"casos": ["mama-completo", "mama-completo"]}, "contextual.casos"),
        ({"casos": []}, "contextual.casos"),
        (
            {"preguntas_de_sinonimos": [{"pregunta": "CTX-C12"}]},
            "contextual.preguntas_de_sinonimos",
        ),
        (
            {
                "preguntas_de_sinonimos": [
                    {"pregunta": "CTX-C12", "termino": "antraciclinas"},
                    {"pregunta": "CTX-C12", "termino": "pertuzumab"},
                ]
            },
            "contextual.preguntas_de_sinonimos",
        ),
        ({"reranker_max_pairs": 0}, "contextual.reranker_max_pairs"),
        (
            {"genericas_con_evidencia_minimo": -1},
            "contextual.genericas_con_evidencia_minimo",
        ),
        (
            {"genericas_con_evidencia_minimo": "18"},
            "contextual.genericas_con_evidencia_minimo",
        ),
        ({"reporte_base": 3}, "contextual.reporte_base"),
    ],
)
def test_la_configuracion_se_rechaza_con_codigo_2_cuando_un_valor_no_es_valido(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], cambio: dict[str, Any], clave: str
) -> None:
    mundo = construir_mundo(tmp_path)
    _con_contextual(mundo, cambio)

    codigo = _correr(mundo, tmp_path / "salida")

    assert codigo == 2
    assert clave in capsys.readouterr().err


def test_la_suite_no_corre_nombrando_el_caso_cuando_el_fixture_no_lo_tiene(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    mundo = construir_mundo(tmp_path, casos=("caso-que-no-existe",))

    codigo = _correr(mundo, tmp_path / "salida")

    assert codigo == 1
    assert "caso-que-no-existe" in capsys.readouterr().err
    assert not (tmp_path / "salida").exists()


def test_la_suite_no_corre_nombrando_la_pregunta_cuando_no_esta_en_el_dataset(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    mundo = construir_mundo(tmp_path, sinonimos=(("CTX-C99", "antraciclinas"),))

    codigo = _correr(mundo, tmp_path / "salida")

    assert codigo == 2
    assert "CTX-C99" in capsys.readouterr().err


def test_el_seudonimo_de_la_suite_cumple_el_patron_del_contrato_y_no_se_repite() -> None:
    seudonimos = [seudonimo_de_la_suite(i) for i in range(3)]

    assert len(set(seudonimos)) == 3
    assert all(s.startswith("psd_") and s[4:].isalnum() for s in seudonimos)


def _catalogo_con(tmp_path: Path, sinonimos: list[dict[str, str]]) -> Path:
    (tmp_path / "mama").mkdir()
    contenido = {"items": [{"terminoCanonico": "TILs", "sinonimos": sinonimos}]}
    (tmp_path / "mama" / "sinonimos.json").write_text(json.dumps(contenido), encoding="utf-8")
    return tmp_path


def test_cuenta_como_forma_cada_texto_de_sinonimos_del_termino_sea_cual_sea_su_relacion_us_271_ac_9(
    tmp_path: Path,
) -> None:
    catalogo = _catalogo_con(
        tmp_path,
        [
            {"texto": "tumor-infiltrating lymphocytes", "idioma": "en", "relacion": "equivalente"},
            {
                "texto": "linfocitos infiltrantes de tumor",
                "idioma": "es",
                "relacion": "miembro_de_clase",
            },
        ],
    )

    assert set(formas_del_termino(catalogo, ["mama"], "tils")) == {
        "tils",
        "tumor infiltrating lymphocytes",
        "linfocitos infiltrantes de tumor",
    }


def test_las_formas_de_un_termino_que_no_es_canonico_del_catalogo_estan_vacias(
    tmp_path: Path,
) -> None:
    catalogo = _catalogo_con(
        tmp_path,
        [{"texto": "linfocitos infiltrantes de tumor", "idioma": "es", "relacion": "equivalente"}],
    )

    assert formas_del_termino(catalogo, ["mama"], "linfocitos infiltrantes de tumor") == ()


def test_las_formas_de_los_tres_terminos_del_ac_9_salen_del_catalogo_versionado() -> None:
    for termino in ("antraciclinas", "pertuzumab", "TILs"):
        assert len(formas_del_termino(CATALOGOS, ["mama", "prostata"], termino)) >= 2
