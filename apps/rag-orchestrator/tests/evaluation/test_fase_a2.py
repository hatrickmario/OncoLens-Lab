"""Pruebas de humo de T2–T5 (tarea 1.15) con embeddings falsos y un índice falso (sin Milvus)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from app.evaluation.chunking_variants import Variante
from app.evaluation.config_medicion import ModeloSpec
from app.evaluation.dataset_loader import cargar_dataset
from app.evaluation.fase_a2 import (
    SALIDA_OK,
    SALIDA_PREVIA,
    ConfigA2,
    ejecutar_etapa_con_puertos,
)
from app.evaluation.indices_milvus import (
    ColeccionProhibida,
    ResultadoIndice,
    estimar_bytes_indice,
    nombre_temporal,
    recall_frente_a_flat,
    verificar_nombre_temporal,
)
from app.scripts.adr39_fetch_sources import descargar_fuentes
from datos_sinteticos import mock_fuentes, preparar_dataset
from modelos_falsos import FabricaFalsa
import httpx
import respx

AHORA = datetime(2026, 10, 16, 9, 0, tzinfo=timezone.utc)
SPEC = ModeloSpec("A", "embeddings", "falso/a", "a" * 40, "embedding", 512, pooling="cls")


def config(**cambios: Any) -> ConfigA2:
    base = dict(
        dataset="",
        semilla_bootstrap=3,
        bootstrap_repeticiones=30,
        hilos_cpu=1,
        k=10,
        spec=SPEC,
        cuantizacion="int8",
        chunk_selection_margin=0.02,
        index_min_recall_vs_flat=0.99,
        tamanos=(4, 8, 16),
        solapamientos=(0.0, 0.10, 0.15),
        estrategias=("tamano_fijo", "estructura"),
        indices=("FLAT", "HNSW"),
        parametros_hnsw={"M": 16, "efConstruction": 200, "ef": 64},
        milvus_uri="http://milvus-falso:19530",
        consultas_latencia_indice=2,
        reporte="reports/adr39/x.json",
        base=Variante(8, 0.0, "tamano_fijo"),
    )
    base.update(cambios)
    return ConfigA2(**base)  # type: ignore[arg-type]


class ComparadorFalso:
    """FLAT exacto con numpy; HNSW 'aproximado' que devuelve el mismo top-k salvo el último, para probar la regla."""

    def __init__(self, perder_vecino_en_hnsw: bool = True) -> None:
        self.llamadas: list[str] = []
        self.perder = perder_vecino_en_hnsw

    def evaluar(self, vectores: np.ndarray, consultas: np.ndarray, tipo: str, parametros: dict[str, Any], k: int) -> ResultadoIndice:
        self.llamadas.append(tipo)
        puntajes = consultas @ vectores.T
        ids, valores = [], []
        for fila in puntajes:
            orden = list(np.argsort(-fila, kind="stable")[:k])
            if tipo == "HNSW" and self.perder and len(orden) >= k:
                orden[-1] = int(np.argsort(fila, kind="stable")[0])  # sustituye al décimo vecino por el peor chunk
            ids.append([int(i) for i in orden])
            valores.append([float(fila[i]) for i in orden])
        return ResultadoIndice(tipo, parametros, ids, valores, [1.0, 2.0, 3.0])


@pytest.fixture()
def escenario(tmp_path: Path):
    with respx.mock(assert_all_called=False) as router:
        mock_fuentes(router)
        dataset = cargar_dataset(preparar_dataset(tmp_path))
        fuentes = descargar_fuentes(dataset, tmp_path / "cache", httpx.Client(), lambda: AHORA, dormir=lambda _s: None)
    secciones = {i: f.secciones for i, f in fuentes.items()}
    return dataset, secciones, tmp_path


def correr(etapa: str, escenario, comparador=None, **cambios: Any) -> tuple[int, Path]:
    dataset, secciones, tmp = escenario
    reporte = tmp / "fase-a2.json"
    contador = iter(range(1, 10_000))
    codigo = ejecutar_etapa_con_puertos(
        etapa, config(**cambios), dataset, secciones, FabricaFalsa(), tmp / "onnx", tmp / "vectores", reporte,
        comparador, lambda: next(contador) / 100.0, lambda: AHORA,
    )
    return codigo, reporte


@pytest.mark.ac("US-012", 10)
def test_t2_y_t3_miden_una_variante_por_valor_y_fijan_tamano_y_solapamiento_ac10(escenario) -> None:
    assert correr("t2", escenario)[0] == SALIDA_OK
    codigo, reporte = correr("t3", escenario)

    etapas = json.loads(reporte.read_text())["etapas"]
    assert codigo == SALIDA_OK
    assert [v["tamano"] for v in etapas["t2"]["variantes"]] == [4, 8, 16]
    assert {v["solapamiento_pct"] for v in etapas["t3"]["variantes"]} == {0.0, 0.10, 0.15}
    assert len({v["tamano"] for v in etapas["t3"]["variantes"]}) == 1  # un solo factor varía
    assert etapas["t2"]["elegida"] in {v["variante"] for v in etapas["t2"]["variantes"]}
    assert all("recall_at_10" in v["metricas"]["total"] and "recall_ic95" in v["metricas"]["total"] for v in etapas["t2"]["variantes"])


@pytest.mark.ac("US-012", 10)
def test_t2_omite_y_anota_las_variantes_que_superan_la_longitud_maxima_del_modelo_ac10(escenario, monkeypatch) -> None:
    import modelos_falsos

    monkeypatch.setattr(modelos_falsos.FabricaFalsa, "tokenizador", lambda self, spec, directorio: modelos_falsos.TokenizadorPalabras(max_length=10))

    _, reporte = correr("t2", escenario)

    t2 = json.loads(reporte.read_text())["etapas"]["t2"]
    assert [v["tamano"] for v in t2["variantes"]] == [4, 8]
    assert [o["variante"] for o in t2["omitidas"]] == ["tamano_fijo-16-0pct"]


@pytest.mark.ac("US-012", 11)
def test_t4_compara_tamano_fijo_con_estructura_y_registra_el_criterio_de_desempate_ac11(escenario) -> None:
    for etapa in ("t2", "t3"):
        correr(etapa, escenario)

    codigo, reporte = correr("t4", escenario)

    t4 = json.loads(reporte.read_text())["etapas"]["t4"]
    assert codigo == SALIDA_OK
    assert {v["estrategia"] for v in t4["variantes"]} == {"tamano_fijo", "estructura"}
    assert t4["criterio"] and "mejor_recall_dentro_del_ic_de_la_elegida" in t4


def test_una_etapa_sin_la_anterior_termina_con_codigo_de_etapa_previa_y_no_mide(escenario) -> None:
    codigo, reporte = correr("t4", escenario)

    assert codigo == SALIDA_PREVIA and not reporte.exists()


@pytest.mark.ac("US-012", 12)
def test_t5_mantiene_flat_si_hnsw_pierde_recall_frente_a_flat_ac12(escenario) -> None:
    for etapa in ("t2", "t3", "t4"):
        correr(etapa, escenario)
    comparador = ComparadorFalso(perder_vecino_en_hnsw=True)

    codigo, reporte = correr("t5", escenario, comparador=comparador, index_min_recall_vs_flat=0.99, k=2)

    t5 = json.loads(reporte.read_text())["etapas"]["t5"]
    assert codigo == SALIDA_OK and t5["elegido"] == "FLAT"
    assert t5["indices"]["HNSW"]["recall_vs_flat"] < 0.99 and t5["indices"]["FLAT"]["recall_vs_flat"] == 1.0
    assert t5["indices"]["HNSW"]["p95_ms"] > 0


@pytest.mark.ac("US-012", 12)
def test_t5_acepta_hnsw_si_su_recall_frente_a_flat_alcanza_el_minimo_ac12(escenario) -> None:
    for etapa in ("t2", "t3", "t4"):
        correr(etapa, escenario)

    _, reporte = correr("t5", escenario, comparador=ComparadorFalso(perder_vecino_en_hnsw=False))

    assert json.loads(reporte.read_text())["etapas"]["t5"]["elegido"] == "HNSW"


def test_el_reporte_de_a2_no_contiene_textos(escenario) -> None:
    correr("t2", escenario)
    _, reporte = correr("t2", escenario)

    crudo = reporte.read_text()
    for texto in ("valor de P interaction en SET", "Valor de P interaction = 0.028"):
        assert texto not in crudo


def test_recall_frente_a_flat_es_la_fraccion_de_vecinos_exactos_recuperados() -> None:
    assert recall_frente_a_flat([[1, 2, 3, 4]], [[1, 2, 3, 5]], k=4) == pytest.approx(0.75)
    assert recall_frente_a_flat([[1, 2], [3, 4]], [[1, 2], [3, 4]], k=2) == 1.0


def test_nunca_se_usa_la_coleccion_de_produccion_ni_un_nombre_sin_prefijo_temporal() -> None:
    assert nombre_temporal(lambda: "abc") == "adr39_tmp_abc"
    for nombre in ("corpus_chunks", "otra_coleccion"):
        with pytest.raises(ColeccionProhibida):
            verificar_nombre_temporal(nombre)


def test_estimar_bytes_indice_hnsw_suma_los_enlaces_del_grafo_a_los_vectores() -> None:
    plano = estimar_bytes_indice("FLAT", {}, 1000, 1024)
    hnsw = estimar_bytes_indice("HNSW", {"M": 16}, 1000, 1024)

    assert plano == 1000 * 1024 * 4 and hnsw == plano + 1000 * 16 * 2 * 4
