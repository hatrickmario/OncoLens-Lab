"""El conjunto dorado versionado en ``data/evaluation/poblacion-dorado/`` (L1D-299, US-233b AC-1 y AC-8)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.evaluation.config_poblacion import cargar_config_poblacion
from app.evaluation.corrida_poblacion import MedicionSinEvidencia, PuertosDePoblacion
from app.evaluation.dataset_poblacion import DoradoDePoblacion, cargar_dorado
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


def test_el_manifiesto_del_dorado_declara_la_revision_provisional_de_ia_y_deja_el_revisor_humano_vacio() -> (
    None
):
    config = cargar_config_poblacion(CONFIG)
    dorado = cargar_dorado(DORADO, config.licencias_aceptadas)

    assert dorado.revision_provisional is not None
    assert (dorado.revision_provisional.rol, dorado.revision_provisional.fecha) == (
        "ia",
        "2026-11-21",
    )
    assert dorado.revision.completa is False  # la marca de IA no firma el dorado (S7-D2)


def _dorado_versionado() -> DoradoDePoblacion:
    return cargar_dorado(DORADO, cargar_config_poblacion(CONFIG).licencias_aceptadas)


@pytest.mark.ac("US-233b", 1)
def test_el_dorado_versionado_trae_pares_de_prostata_por_tipo_de_fuente_e_idioma_con_licencia_por_documento() -> (
    None
):
    """Trae pares de próstata en guía, ensayo y revisión en es y en, cada documento con licencia [US-233b AC-1]."""
    dorado = _dorado_versionado()
    prostata = [
        p for p in dorado.pares if dorado.documentos[p.documento].tipo_de_cancer == "prostata"
    ]
    celdas = {
        (dorado.documentos[p.documento].estrato, dorado.documentos[p.documento].idioma)
        for p in prostata
    }

    assert {p.criterio for p in prostata} == {
        "estado_castracion",
        "isup",
        "ecog",
        "linea_tratamiento",
        "extension",  # S7.10b (C-1)
        "hrr_brca",  # S7.10b (C-5)
    }
    assert celdas == {(e, i) for e in ("guia", "ensayo", "revision") for i in ("es", "en")}
    assert (
        len(prostata) >= 16
    )  # S7.10b: con extension y hrr_brca el dorado llega a >= 16 pares de próstata
    licencias = json.loads((DORADO / "manifest.json").read_text(encoding="utf-8"))["licencias"]
    assert set(licencias) >= set(dorado.documentos)


@pytest.mark.ac("US-233b", 1)
def test_el_dorado_versionado_trae_casos_dificiles_de_los_seis_tipos_y_distractores_sin_elegibilidad() -> (
    None
):
    """Trae ≥ 12 casos difíciles de los seis tipos y ≥ 8 distractores sin valores de elegibilidad [US-233b AC-1]."""
    dorado = _dorado_versionado()
    dificiles = [p for p in dorado.pares if p.redaccion == "dificil"]
    distractores = [p for p in dorado.pares if p.distractor]

    assert len(dificiles) >= 12
    assert {p.tipo_de_redaccion for p in dificiles} == {
        "negacion",
        "rango",
        "definicion_implicita",
        "inclusion_total",
        "umbral",
        "tabla",
    }
    assert len(distractores) >= 8
    assert all(v.scope in ("subgrupo", "mencion") for p in distractores for v in p.esperados)
    assert all(p.redaccion == "plantilla" for p in distractores)


def test_el_dorado_versionado_no_conserva_las_frases_sin_sentido_clinico_de_la_semilla() -> None:
    dorado = _dorado_versionado()
    textos = [f.texto for d in dorado.documentos.values() for f in d.fragmentos]

    frases = ("tenian mujeres", "tenian primera linea", "had premenopausal", "had first line")
    assert [t for t in textos if any(frase in t for frase in frases)] == []


@pytest.mark.ac("US-233b", 4)
def test_el_dorado_versionado_trae_los_casos_de_la_rendija_c3_de_mama_con_el_esperado_de_la_regla_vigente() -> (
    None
):
    """Trae los casos de C-3 con criterios de mama y el esperado de la regla vigente (desconocido) [US-233b AC-4]."""
    dorado = _dorado_versionado()
    c3 = [c for c in dorado.estados if c.rendija == "c3"]

    assert len(c3) >= 3
    assert {c.tipo_de_cancer for c in c3} == {"mama"}
    assert {c.esperado for c in c3} == {"desconocido"}
    assert all(
        len(c.valores) == 1
        and c.valores[0].scope == "elegibilidad"
        and "only" not in c.valores[0].valor
        for c in c3
    )
    assert (
        dorado.catalogo_de_estados.name == "test-apl-1.11.0"
    )  # S7-D4: fixture con las reglas de próstata


def test_el_manifiesto_del_dorado_subio_su_version_respecto_de_la_semilla() -> None:
    assert _dorado_versionado().version != "0-semilla"
