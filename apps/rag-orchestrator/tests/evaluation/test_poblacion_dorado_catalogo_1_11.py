"""Dorado de población sobre el catálogo 1.11.0 (L1D-299, S7.9, S7.10 y S7.10b; design S7-D4 y S7-D5).

Los casos y pares que dependen de la parte B de ``l1d-126`` (C-1, C-2, C-4 y C-5) llevan la etapa_del_dataset
``tras_catalogo_s7`` y el reporte los separa de la base. Las reglas de estado son las de ``app/domain``; el catálogo de estados del
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
from app.evaluation.dataset_poblacion import (
    ETAPA_BASE,
    ETAPA_TRAS_CATALOGO_S7,
    DoradoDePoblacion,
    cargar_dorado,
)
from app.evaluation.evaluate import main
from app.evaluation.metricas.poblacion import (
    CasoDeEstado,
    ParMedido,
    concordancia_por_etapa_del_dataset,
    cobertura_por_etapa_del_dataset,
    precision_por_etapa_del_dataset,
)
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.evaluation.dorado_de_prueba import ESTADOS, PARES, escribir_config, escribir_dorado
from tests.support.catalogo_aplicabilidad import APL_1_11_0
from tests.support.contract import CATALOGOS
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-poblacion.yaml"
DORADO = RAIZ_REPO / "data" / "evaluation" / "poblacion-dorado"
ETAPA = ETAPA_TRAS_CATALOGO_S7
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


# --- etapa_del_dataset: dataset y métricas ----------------------------------------------------------------------------------------


def test_un_par_y_un_caso_sin_etapa_del_dataset_son_de_la_base(tmp_path: Path) -> None:
    carpeta = escribir_dorado(tmp_path / "dorado")
    dorado = cargar_dorado(carpeta, frozenset({"sintetico_propio"}))

    assert {p.etapa_del_dataset for p in dorado.pares} == {None}
    assert {e.etapa_del_dataset for e in dorado.estados} == {None}


def test_el_dorado_lee_la_etapa_de_un_par_y_de_un_caso(tmp_path: Path) -> None:
    pares = copy.deepcopy(PARES)
    pares[0]["etapa_del_dataset"] = ETAPA
    estados = copy.deepcopy(ESTADOS)
    estados[0]["etapa_del_dataset"] = ETAPA

    dorado = cargar_dorado(
        escribir_dorado(tmp_path / "dorado", pares=pares, estados=estados),
        frozenset({"sintetico_propio"}),
    )

    assert dorado.pares[0].etapa_del_dataset == ETAPA
    assert dorado.estados[0].etapa_del_dataset == ETAPA


def test_el_dorado_rechaza_una_etapa_del_dataset_fuera_del_conjunto(tmp_path: Path) -> None:
    pares = copy.deepcopy(PARES)
    pares[0]["etapa_del_dataset"] = "otra_etapa_del_dataset"

    with pytest.raises(DatasetInvalido):
        cargar_dorado(
            escribir_dorado(tmp_path / "dorado", pares=pares), frozenset({"sintetico_propio"})
        )


def test_precision_y_cobertura_por_etapa_del_dataset_separan_la_base_de_lo_agregado_despues() -> (
    None
):
    pares = [
        ParMedido("d1", "ecog", frozenset({"a"}), ("a",)),
        ParMedido("d2", "ecog", frozenset({"b", "c"}), ("b", "x"), etapa_del_dataset=ETAPA),
    ]

    assert precision_por_etapa_del_dataset(pares)[ETAPA_BASE].valor == 1.0
    assert precision_por_etapa_del_dataset(pares)[ETAPA].valor == 0.5
    assert cobertura_por_etapa_del_dataset(pares)[ETAPA].valor == 0.5
    assert set(cobertura_por_etapa_del_dataset(pares)) == {ETAPA_BASE, ETAPA}


def test_concordancia_por_etapa_del_dataset_cuenta_aciertos_y_total_de_cada_etapa_del_dataset() -> (
    None
):
    casos = [
        CasoDeEstado("a", "coincide", "coincide"),
        CasoDeEstado("b", "parcial", "desconocido", etapa_del_dataset=ETAPA),
        CasoDeEstado("c", "parcial", "parcial", etapa_del_dataset=ETAPA),
    ]

    por_etapa_del_dataset = concordancia_por_etapa_del_dataset(casos)

    assert (
        por_etapa_del_dataset[ETAPA_BASE].aciertos,
        por_etapa_del_dataset[ETAPA_BASE].total,
    ) == (1, 1)
    assert (por_etapa_del_dataset[ETAPA].aciertos, por_etapa_del_dataset[ETAPA].total) == (1, 2)


@pytest.mark.ac("US-233b", 2)
def test_el_reporte_separa_pares_y_casos_de_la_etapa_del_dataset_tras_el_catalogo_s7_de_la_base(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Reporta aparte los pares y casos de la etapa_del_dataset tras_catalogo_s7 [US-233b AC-2]."""
    pares = copy.deepcopy(PARES)
    pares[0]["etapa_del_dataset"] = ETAPA
    estados = copy.deepcopy(ESTADOS)
    estados[0]["etapa_del_dataset"] = ETAPA
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
    assert {f["etapa_del_dataset"] for f in metricas["por_etapa_del_dataset"]} == {
        ETAPA_BASE,
        ETAPA,
    }
    assert {f["etapa_del_dataset"] for f in metricas["concordancia"]["por_etapa_del_dataset"]} == {
        ETAPA_BASE,
        ETAPA,
    }


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
    assert {p.etapa_del_dataset for p in nuevos} == {ETAPA}
    assert all(v.scope == "elegibilidad" for p in nuevos for v in p.esperados)


@pytest.mark.ac("US-233b", 1)
def test_el_dorado_trae_pares_sobre_her2_bajo_de_mama_en_la_etapa_del_catalogo_s7() -> None:
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
    assert {p.etapa_del_dataset for p in bajos} == {ETAPA}


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
        and p.etapa_del_dataset == ETAPA
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
        and p.etapa_del_dataset == ETAPA
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
    cómputo (las reglas de ``app/domain``, sobre la copia ``test-apl-1.11.0`` del catálogo) concuerda sin No coincide ni Coincide indebidos [US-233b AC-4]."""
    dorado = _dorado_versionado()
    nuevos = [c for c in dorado.estados if c.etapa_del_dataset == ETAPA]
    castracion = [c for c in nuevos if c.criterio == "estado_castracion"]
    extension = [c for c in nuevos if c.criterio == "extension"]

    assert dorado.catalogo_de_estados == APL_1_11_0
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
    por_etapa_del_dataset = {
        f["etapa_del_dataset"]: f for f in concordancia["por_etapa_del_dataset"]
    }
    assert por_etapa_del_dataset[ETAPA]["total"] == len(nuevos)
    assert por_etapa_del_dataset[ETAPA]["aciertos"] == len(nuevos)
    assert ETAPA_BASE in por_etapa_del_dataset


def test_el_dorado_conserva_los_estados_de_mama_de_la_base_con_el_catalogo_1_11_0(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    dorado = _dorado_versionado()
    base = [c for c in dorado.estados if c.etapa_del_dataset is None]

    assert {c.id for c in base} >= {"F-20", "F-21", "F-21b", "F-22", "F-23", "C-3a", "C-3d"}
    _, reporte = _correr_versionado(tmp_path, capsys)
    por_etapa_del_dataset = {
        f["etapa_del_dataset"]: f
        for f in reporte["metricas"]["concordancia"]["por_etapa_del_dataset"]
    }
    assert (
        por_etapa_del_dataset[ETAPA_BASE]["aciertos"]
        == por_etapa_del_dataset[ETAPA_BASE]["total"]
        == len(base)
    )


@pytest.mark.parametrize("tipo", ["mama", "prostata"])
@pytest.mark.parametrize("archivo", ["aplicabilidad.json", "poblacion-reglas.json"])
def test_la_fixture_1_11_0_iguala_a_cada_criterio_del_catalogo_real(
    tipo: str, archivo: str
) -> None:
    """La copia no se queda atrás: con el catálogo real distinto del fixture, el dorado mediría reglas obsoletas. Si falla
    tras un bump del catálogo, se vuelve a copiar el archivo (solo cambia ``version``) y se revisa el dorado."""
    de_la_fixture = json.loads((APL_1_11_0 / tipo / archivo).read_text(encoding="utf-8"))
    real = json.loads((CATALOGOS / tipo / archivo).read_text(encoding="utf-8"))

    de_la_fixture.pop("version")
    real.pop("version")
    assert de_la_fixture == real
