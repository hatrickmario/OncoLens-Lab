"""Dorado de población sobre el catálogo 1.11.0 (L1D-299, S7.9, S7.10 y S7.10b; design S7-D4 y S7-D5).

Los casos y pares que dependen de la parte B de ``l1d-126`` (C-1, C-2, C-4 y C-5) llevan la ventana
``tras_catalogo_s7`` y el reporte los separa de la base. Las reglas de estado son las reales; el catálogo de estados del
dorado es el fixture ``test-apl-1.11.0`` (copia de las reglas de mama y próstata del catálogo 1.11.0), no el real.
Solo agregados e identificadores en el reporte (RN-14).
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from app.evaluation.config_poblacion import cargar_config_poblacion
from app.evaluation.corrida_poblacion import MedicionSinEvidencia, PuertosDePoblacion
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.dataset_poblacion import DoradoDePoblacion, cargar_dorado
from app.evaluation.evaluate import main
from app.evaluation.metricas.poblacion import (
    CasoDeEstado,
    ParMedido,
    concordancia_por_ventana,
    cobertura_por_ventana,
    precision_por_ventana,
)
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.evaluation.dorado_de_prueba import ESTADOS, PARES, escribir_config, escribir_dorado
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-poblacion.yaml"
DORADO = RAIZ_REPO / "data" / "evaluation" / "poblacion-dorado"
VENTANA = "tras_catalogo_s7"
ESTRATOS_E_IDIOMAS = {(e, i) for e in ("guia", "ensayo", "revision") for i in ("es", "en")}


def _dorado_versionado() -> DoradoDePoblacion:
    return cargar_dorado(DORADO, cargar_config_poblacion(CONFIG).licencias_aceptadas)


def _celda(dorado: DoradoDePoblacion, documento: str) -> tuple[str, str]:
    d = dorado.documentos[documento]
    return (d.estrato, d.idioma)


def _correr_versionado(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> tuple[int, dict[str, Any]]:
    codigo = main(
        ["--config", str(CONFIG), "--suite", "poblacion", "--salida", str(tmp_path)],
        reloj=RelojFijo(),
        puertos_poblacion=PuertosDePoblacion(lambda _c: MedicionSinEvidencia(1.0, 0)),
    )
    assert codigo == 0, capsys.readouterr().err
    return codigo, json.loads(next(tmp_path.glob("*.json")).read_text(encoding="utf-8"))


# --- ventana: dataset y métricas ----------------------------------------------------------------------------------------


def test_un_par_y_un_caso_sin_ventana_son_de_la_base(tmp_path: Path) -> None:
    carpeta = escribir_dorado(tmp_path / "dorado")
    dorado = cargar_dorado(carpeta, frozenset({"sintetico_propio"}))

    assert {p.ventana for p in dorado.pares} == {None}
    assert {e.ventana for e in dorado.estados} == {None}


def test_el_dorado_lee_la_ventana_de_un_par_y_de_un_caso(tmp_path: Path) -> None:
    pares = copy.deepcopy(PARES)
    pares[0]["ventana"] = VENTANA
    estados = copy.deepcopy(ESTADOS)
    estados[0]["ventana"] = VENTANA

    dorado = cargar_dorado(
        escribir_dorado(tmp_path / "dorado", pares=pares, estados=estados),
        frozenset({"sintetico_propio"}),
    )

    assert dorado.pares[0].ventana == VENTANA
    assert dorado.estados[0].ventana == VENTANA


def test_el_dorado_rechaza_una_ventana_fuera_del_conjunto(tmp_path: Path) -> None:
    pares = copy.deepcopy(PARES)
    pares[0]["ventana"] = "otra_ventana"

    with pytest.raises(DatasetInvalido):
        cargar_dorado(
            escribir_dorado(tmp_path / "dorado", pares=pares), frozenset({"sintetico_propio"})
        )


def test_precision_y_cobertura_por_ventana_separan_la_base_de_lo_agregado_despues() -> None:
    pares = [
        ParMedido("d1", "ecog", frozenset({"a"}), ("a",)),
        ParMedido("d2", "ecog", frozenset({"b", "c"}), ("b", "x"), ventana=VENTANA),
    ]

    assert precision_por_ventana(pares)["base"].valor == 1.0
    assert precision_por_ventana(pares)[VENTANA].valor == 0.5
    assert cobertura_por_ventana(pares)[VENTANA].valor == 0.5
    assert set(cobertura_por_ventana(pares)) == {"base", VENTANA}


def test_concordancia_por_ventana_cuenta_aciertos_y_total_de_cada_ventana() -> None:
    casos = [
        CasoDeEstado("a", "coincide", "coincide"),
        CasoDeEstado("b", "parcial", "desconocido", ventana=VENTANA),
        CasoDeEstado("c", "parcial", "parcial", ventana=VENTANA),
    ]

    por_ventana = concordancia_por_ventana(casos)

    assert (por_ventana["base"].aciertos, por_ventana["base"].total) == (1, 1)
    assert (por_ventana[VENTANA].aciertos, por_ventana[VENTANA].total) == (1, 2)


@pytest.mark.ac("US-233b", 2)
def test_el_reporte_separa_pares_y_casos_de_la_ventana_tras_el_catalogo_s7_de_la_base(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Reporta aparte los pares y casos de la ventana tras_catalogo_s7 [US-233b AC-2]."""
    pares = copy.deepcopy(PARES)
    pares[0]["ventana"] = VENTANA
    estados = copy.deepcopy(ESTADOS)
    estados[0]["ventana"] = VENTANA
    carpeta = escribir_dorado(tmp_path / "dorado", pares=pares, estados=estados)
    ruta = escribir_config(tmp_path, carpeta)
    salida = tmp_path / "salida"

    codigo = main(
        ["--config", str(ruta), "--suite", "poblacion", "--salida", str(salida)],
        reloj=RelojFijo(),
        puertos_poblacion=PuertosDePoblacion(lambda _c: MedicionSinEvidencia(1.0, 0)),
    )

    assert codigo == 0, capsys.readouterr().err
    metricas = json.loads(next(salida.glob("*.json")).read_text(encoding="utf-8"))["metricas"]
    assert {f["ventana"] for f in metricas["por_ventana"]} == {"base", VENTANA}
    assert {f["ventana"] for f in metricas["concordancia"]["por_ventana"]} == {"base", VENTANA}


# --- S7.9 · S7.10b: pares ----------------------------------------------------------------------------------------------


@pytest.mark.ac("US-233b", 1)
def test_el_dorado_trae_pares_de_extension_y_hrr_brca_en_las_seis_celdas_y_llega_a_16_de_prostata() -> (
    None
):
    """Trae pares de extension y hrr_brca por guía, ensayo y revisión en es y en, y ≥ 16 de próstata [US-233b AC-1]."""
    dorado = _dorado_versionado()
    prostata = [
        p for p in dorado.pares if dorado.documentos[p.documento].tipo_de_cancer == "prostata"
    ]

    assert len(prostata) >= 16
    for criterio in ("extension", "hrr_brca"):
        celdas = {_celda(dorado, p.documento) for p in prostata if p.criterio == criterio}
        assert celdas == ESTRATOS_E_IDIOMAS, criterio
    nuevos = [p for p in prostata if p.criterio in ("extension", "hrr_brca")]
    assert {p.ventana for p in nuevos} == {VENTANA}
    assert all(v.scope == "elegibilidad" for p in nuevos for v in p.esperados)


@pytest.mark.ac("US-233b", 1)
def test_el_dorado_trae_pares_sobre_her2_bajo_de_mama_en_la_ventana_del_catalogo_s7() -> None:
    """Trae pares de estado_her2 con HER2 bajo (IHC 1+ o 2+ con ISH negativo) en guía, ensayo y revisión
    [US-233b AC-1]."""
    dorado = _dorado_versionado()

    def _habla_de_her2_bajo(documento: str) -> bool:
        texto = " ".join(f.texto.lower() for f in dorado.documentos[documento].fragmentos)
        return any(frase in texto for frase in ("her2-low", "her2 bajo", "low her2"))

    bajos = [
        p for p in dorado.pares if p.criterio == "estado_her2" and _habla_de_her2_bajo(p.documento)
    ]

    assert len(bajos) >= 4
    assert {dorado.documentos[p.documento].estrato for p in bajos} == {"guia", "ensayo", "revision"}
    assert {dorado.documentos[p.documento].idioma for p in bajos} == {"es", "en"}
    assert {p.ventana for p in bajos} == {VENTANA}


@pytest.mark.ac("US-233b", 1)
def test_el_triple_negativo_se_declara_inclusivo_y_se_proyecta_en_los_dos_criterios_como_en_c_4() -> (
    None
):
    """El triple negativo junto al receptor hormonal positivo se declara cohorte inclusiva (elegibilidad) y se
    proyecta en receptores_hormonales y estado_her2 [US-233b AC-1]."""
    dorado = _dorado_versionado()
    receptores = [
        p
        for p in dorado.pares
        if p.criterio == "receptores_hormonales"
        and any("triple" in v.valor.lower() for v in p.esperados)
        and p.ventana == VENTANA
    ]

    assert len(receptores) >= 3
    for par in receptores:
        assert {v.scope for v in par.esperados} == {"elegibilidad"}, par.id
        texto = " ".join(f.texto for f in dorado.documentos[par.documento].fragmentos).lower()
        assert "both" in texto or "ambos" in texto, (
            par.id
        )  # la frase dice que la cohorte es inclusiva
    en_her2 = {
        p.documento
        for p in dorado.pares
        if p.criterio == "estado_her2"
        and any("triple" in v.valor.lower() for v in p.esperados)
        and p.ventana == VENTANA
    }
    assert en_her2 == {p.documento for p in receptores}


def test_el_manifiesto_subio_la_version_del_dorado_y_declara_la_licencia_de_cada_documento_nuevo() -> (
    None
):
    dorado = _dorado_versionado()
    licencias = json.loads((DORADO / "manifest.json").read_text(encoding="utf-8"))["licencias"]

    assert dorado.version not in ("0-semilla", "s7-1")
    assert set(licencias) >= set(dorado.documentos)
    assert set(licencias.values()) == {"sintetico_propio"}


# --- S7.10: estados ----------------------------------------------------------------------------------------------------


@pytest.mark.ac("US-233b", 4)
def test_el_dorado_concuerda_con_las_reglas_del_catalogo_1_11_0_en_castracion_y_extension_sin_indebidos(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Trae un caso por regla F-20…F-23 con estado_castracion y los de extension (M0/M1 legible y repliegue), y el
    cómputo con las reglas reales concuerda sin No coincide ni Coincide indebidos [US-233b AC-4]."""
    dorado = _dorado_versionado()
    nuevos = [c for c in dorado.estados if c.ventana == VENTANA]
    castracion = [c for c in nuevos if c.criterio == "estado_castracion"]
    extension = [c for c in nuevos if c.criterio == "extension"]

    assert dorado.catalogo_de_estados.name == "test-apl-1.11.0"
    assert {c.esperado for c in castracion} == {"parcial", "desconocido", "no_coincide", "coincide"}
    assert len(castracion) >= 5  # F-20, F-21, F-21b (restricción explícita), F-22 y F-23
    assert {c.tipo_de_cancer for c in nuevos} == {"prostata"}
    assert {c.esperado for c in extension} == {"no_coincide", "coincide", "desconocido"}
    assert any(c.paciente == "T2c" and c.esperado == "desconocido" for c in extension)  # repliegue
    assert any("M0" in c.paciente and c.esperado == "no_coincide" for c in extension)  # M0 legible

    _, reporte = _correr_versionado(tmp_path, capsys)

    concordancia = reporte["metricas"]["concordancia"]
    assert concordancia["aciertos"] == concordancia["total"]
    assert (concordancia["no_coincide_indebido"], concordancia["coincide_indebido"]) == (0, 0)
    por_ventana = {f["ventana"]: f for f in concordancia["por_ventana"]}
    assert por_ventana[VENTANA]["total"] == len(nuevos)
    assert por_ventana[VENTANA]["aciertos"] == len(nuevos)
    assert "base" in por_ventana


def test_el_dorado_conserva_los_estados_de_mama_de_la_base_con_el_catalogo_1_11_0(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    dorado = _dorado_versionado()
    base = [c for c in dorado.estados if c.ventana is None]

    assert {c.id for c in base} >= {"F-20", "F-21", "F-21b", "F-22", "F-23", "C-3a", "C-3d"}
    _, reporte = _correr_versionado(tmp_path, capsys)
    por_ventana = {f["ventana"]: f for f in reporte["metricas"]["concordancia"]["por_ventana"]}
    assert por_ventana["base"]["aciertos"] == por_ventana["base"]["total"] == len(base)
