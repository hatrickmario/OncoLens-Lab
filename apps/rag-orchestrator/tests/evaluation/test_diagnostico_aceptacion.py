"""Aceptación de la familia `diagnostico` de `evaluate` (US-276 AC-1…AC-4, L1D-334).

Adaptadores falsos y reloj congelado. Cada redacción del fixture declara qué ve cada etapa (candidatos densos, puntajes del
reranker, propuesta del generador), así que cada pérdida es de una etapa conocida; la corrida es la real: el servicio de
consulta, los observadores de la suite y el informe cerrado. Sin mocks de módulos propios.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.evaluation.corrida_diagnostico import PuertosDeDiagnostico
from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.evaluation.mundo_diagnostico import (
    Mundo,
    ParDePrueba,
    Redaccion,
    TIPOS,
    con_evidencia,
    construir_mundo,
    esperado,
    par_de_cada_etapa,
)
from tests.support.fakes import RelojFijo

CONFIG_FAKE = RAIZ_APP / "eval" / "configs" / "diagnostico-fake.yaml"
PARES_REALES = RAIZ_REPO / "data" / "eval" / "parafrasis-v1" / "pares.yaml"
CAMPOS_DE_LA_FILA = {
    "par",
    "redaccion",
    "pregunta_id",
    "idioma",
    "chunk_esperado",
    "puesto_denso",
    "entro_en_pares",
    "relevance_score",
    "supero_umbral",
    "con_evidencia",
    "opciones_generadas",
    "opciones_mostradas",
    "opciones_descartadas",
    "afirmaciones_aprobadas",
    "afirmaciones_descartadas",
    "loops",
}
ETAPAS = ("recuperacion_densa", "corte_de_pares", "umbral_de_relevancia", "nli")


def correr(
    config: Path, salida: Path, puertos: PuertosDeDiagnostico | None = None
) -> tuple[int, dict[str, Any] | None]:
    codigo = main(
        ["--config", str(config), "--suite", "diagnostico", "--salida", str(salida)],
        reloj=RelojFijo(),
        puertos_diagnostico=puertos,
    )
    archivos = sorted(salida.glob("*.json"))
    reporte = json.loads(archivos[0].read_text(encoding="utf-8")) if archivos else None
    return codigo, reporte


def correr_mundo(tmp_path: Path, mundo: Mundo, nombre: str = "salida") -> dict[str, Any]:
    codigo, reporte = correr(mundo.config, tmp_path / nombre, mundo.puertos)
    assert codigo == 0
    assert reporte is not None
    return reporte


def fila(reporte: dict[str, Any], identificador: str) -> dict[str, Any]:
    return next(f for f in reporte["preguntas"] if f["pregunta_id"] == identificador)


def par(reporte: dict[str, Any], identificador: str) -> dict[str, Any]:
    return next(p for p in reporte["pares"] if p["par"] == identificador)


@pytest.mark.ac("US-276", 1)
def test_diagnostico_da_por_pregunta_el_puesto_denso_la_entrada_en_los_pares_el_score_el_umbral_las_opciones_y_las_afirmaciones_con_adaptadores_falsos(
    tmp_path: Path,
) -> None:
    mundo = construir_mundo(tmp_path, par_de_cada_etapa())

    reporte = correr_mundo(tmp_path, mundo)

    assert len(reporte["preguntas"]) == 14
    assert all(set(f) == CAMPOS_DE_LA_FILA for f in reporte["preguntas"])
    con_todo = fila(reporte, "P4-b")  # sobre el umbral y con una afirmación descartada por el NLI
    assert (con_todo["puesto_denso"], con_todo["entro_en_pares"]) == (1, True)
    assert (con_todo["relevance_score"], con_todo["supero_umbral"]) == (0.9, True)
    assert (con_todo["opciones_generadas"], con_todo["opciones_mostradas"]) == (1, 0)
    assert (con_todo["afirmaciones_aprobadas"], con_todo["afirmaciones_descartadas"]) == (0, 1)
    umbrales = reporte["configuracion"]["umbrales"]
    assert (umbrales["retrievalTopK"], umbrales["rerankerMaxPairs"]) == (4, 2)
    assert (umbrales["relevanceThreshold"], umbrales["nliEntailmentThreshold"]) == (0.3, 0.7)


@pytest.mark.ac("US-276", 2)
def test_diagnostico_asigna_la_perdida_a_una_sola_etapa_y_da_el_recuento_por_etapa_cuando_una_redaccion_tiene_evidencia_y_la_otra_no(
    tmp_path: Path,
) -> None:
    mundo = construir_mundo(tmp_path, par_de_cada_etapa())

    reporte = correr_mundo(tmp_path, mundo)

    assert [par(reporte, f"P{i}")["etapa"] for i in range(1, 5)] == list(ETAPAS)
    assert [par(reporte, p)["causa"] for p in ("P5", "P6")] == ["sin_opciones_generadas", "citas"]
    assert [par(reporte, p)["resultado"] for p in ("P5", "P6", "P7")] == [
        "sin_asignar",
        "sin_asignar",
        "sin_perdida",
    ]
    assert par(reporte, "P7")["etapa"] is None
    assert reporte["recuento_por_etapa"] == {
        "recuperacion_densa": 1,
        "corte_de_pares": 1,
        "umbral_de_relevancia": 1,
        "nli": 1,
        "sin_asignar": 2,
        "sin_perdida": 1,
    }
    assert sum(reporte["recuento_por_etapa"].values()) == len(reporte["pares"]) == 7
    assert [r["etapa"] for r in reporte["regla_de_asignacion"]] == list(ETAPAS)


def _descartadas(tmp_path: Path, pares: list[ParDePrueba]) -> tuple[Mundo, dict[str, Any]]:
    mundo = construir_mundo(tmp_path, pares)
    return mundo, correr_mundo(tmp_path, mundo)


def _par_con_descartada(identificador: str, i: int, marcador: str) -> ParDePrueba:
    perdida = Redaccion((esperado(i), "x1", "x2", "x3"), {esperado(i): 0.9}, propuesta=marcador)
    return ParDePrueba(identificador, TIPOS[i % 4], con_evidencia(i), perdida)


@pytest.mark.ac("US-276", 3)
def test_diagnostico_da_el_histograma_de_p_entailment_y_el_recuento_de_la_banda_bajo_el_umbral_sin_proponer_un_umbral_cuando_el_nli_descarta_afirmaciones(
    tmp_path: Path,
) -> None:
    pares = [
        _par_con_descartada("P1", 1, "alfa"),  # p_entailment 0,55
        _par_con_descartada("P2", 2, "beta"),  # 0,65
        _par_con_descartada("P3", 3, "gamma"),  # 0,10
        ParDePrueba("P4", TIPOS[0], con_evidencia(4), con_evidencia(4)),
    ]
    mundo = construir_mundo(tmp_path, pares)
    antes = mundo.config.read_bytes()

    reporte = correr_mundo(tmp_path, mundo)

    nli = reporte["nli"]
    assert (nli["umbral"], nli["banda_inferior"], nli["ancho_de_tramo"]) == (0.7, 0.5, 0.1)
    assert nli["descartadas"] == 3
    assert sum(t["recuento"] for t in nli["tramos"]) == nli["descartadas"]
    assert {t["desde"]: t["recuento"] for t in nli["tramos"] if t["recuento"]} == {
        0.1: 1,
        0.5: 1,
        0.6: 1,
    }
    assert nli["en_banda"] == 2
    assert "calibración" in json.dumps(nli["nota"], ensure_ascii=False)
    assert not [clave for clave in _claves(reporte) if "propuest" in clave.lower()]
    assert mundo.config.read_bytes() == antes  # la familia no cambia ninguna configuración


def _claves(valor: Any) -> list[str]:
    if isinstance(valor, dict):
        return [*valor, *(c for v in valor.values() for c in _claves(v))]
    if isinstance(valor, list):
        return [c for v in valor for c in _claves(v)]
    return []


@pytest.mark.ac("US-276", 4)
def test_diagnostico_contiene_solo_ids_puestos_y_puntajes_y_rechaza_un_dataset_que_no_es_sintetico_cuando_se_inspecciona_el_informe(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    mundo = construir_mundo(tmp_path / "bueno", par_de_cada_etapa())
    correr_mundo(tmp_path, mundo)
    archivos = [*(tmp_path / "salida").glob("*.json"), *(tmp_path / "salida").glob("*.md")]
    assert len(archivos) == 2
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        assert [t for t in mundo.textos if t in contenido] == []

    for subdirectorio, ajustes, nombrado in (
        ("real", {"clase": "real_anonimizado"}, "sintetico"),
        ("sin_cita", {"cita_en_el_corpus": False}, "P1"),
    ):
        malo = construir_mundo(tmp_path / subdirectorio, par_de_cada_etapa(), **ajustes)
        capsys.readouterr()
        codigo, reporte = correr(malo.config, tmp_path / subdirectorio / "salida", malo.puertos)
        assert codigo != 0
        assert reporte is None
        assert (
            nombrado in capsys.readouterr().err
        )  # nombra la causa: la clase o el par de la cita ausente


def test_diagnostico_con_el_dataset_real_y_la_configuracion_de_la_ci_escribe_una_fila_por_redaccion_y_es_reproducible(
    tmp_path: Path,
) -> None:
    redacciones = sum(
        len(p["redacciones"])
        for p in yaml.safe_load(PARES_REALES.read_text(encoding="utf-8"))["pares"]
    )

    primero, segundo = (correr(CONFIG_FAKE, tmp_path / nombre) for nombre in ("uno", "dos"))

    assert (primero[0], segundo[0]) == (0, 0)
    assert len(primero[1]["preguntas"]) == redacciones  # type: ignore[index]
    assert _bytes_del_informe(tmp_path / "uno") == _bytes_del_informe(tmp_path / "dos")


def _bytes_del_informe(salida: Path) -> bytes:
    return next(salida.glob("*.json")).read_bytes()


def test_diagnostico_deja_en_null_y_nunca_en_cero_lo_que_no_se_observo(tmp_path: Path) -> None:
    reporte = correr_mundo(tmp_path, construir_mundo(tmp_path, par_de_cada_etapa()))

    ausente = fila(reporte, "P1-b")  # el chunk esperado no está entre los candidatos densos
    cortado = fila(reporte, "P2-b")  # candidato en el puesto 3, fuera de los 2 pares
    assert (ausente["puesto_denso"], ausente["entro_en_pares"]) == (None, None)
    assert (ausente["relevance_score"], ausente["supero_umbral"]) == (None, None)
    assert (cortado["puesto_denso"], cortado["entro_en_pares"]) == (3, False)
    assert (cortado["relevance_score"], cortado["supero_umbral"]) == (None, None)
    assert fila(reporte, "P5-b")["afirmaciones_aprobadas"] is None  # el NLI no recibió nada
    assert fila(reporte, "P5-b")["opciones_generadas"] == 0
    assert {f["loops"] for f in reporte["preguntas"]} == {
        1
    }  # el servicio busca dos veces por loop (BUSQUEDAS_POR_LOOP)
