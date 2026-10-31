"""Prueba de humo de ``adr39_measure`` fase A con modelos falsos diminutos (tarea 1.4)."""

from __future__ import annotations

import contextlib
import json
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest
import respx
import yaml
from datos_sinteticos import mock_fuentes, preparar_dataset
from modelos_falsos import FabricaFalsa, exportador_falso

from app.evaluation.config_medicion import cargar_config
from app.evaluation.dataset_loader import cargar_dataset
from app.evaluation.trabajos import Trabajo, ejecutar_trabajo
from app.scripts import adr39_measure as medir
from app.scripts.adr39_fetch_sources import leer_fuentes_de_cache

AHORA = datetime(2026, 10, 16, 9, 0, tzinfo=timezone.utc)
REVISION = "a" * 40


def escribir_config(
    tmp_path: Path, dataset: Path, *, limite_gb: float = 24.0, licencias: tuple[str, ...] = ("mit",)
) -> Path:
    def spec(componente_id: str, tarea: str, **extra: object) -> dict[str, object]:
        return {
            "id": componente_id,
            "modelo": f"falso/{componente_id}",
            "revision": REVISION,
            "tarea": tarea,
            "max_length": 512,
            **extra,
        }

    contenido = {
        "version": 1,
        "dataset": str(dataset),
        "semilla_bootstrap": 7,
        "bootstrap_repeticiones": 50,
        "protocolo": {
            "corridas": 3,
            "calentamiento": 1,
            "hilos_cpu": 1,
            "cuantizaciones": ["int8", "fp32"],
            "tolerancia_empate": 0.02,
        },
        "restricciones": {
            "stack_memory_limit_gb": limite_gb,
            "llm_budget_gb": 0.0,
            "stage_p95_budget_ms": {"embeddings": 60000, "reranker": 60000, "nli": 60000},
            "academic_licenses": list(licencias),
        },
        "recuperacion": {
            "chunking": {"estrategia": "tamano_fijo", "tamano": 8, "solapamiento_pct": 0.0},
            "k": 10,
            "reranker_max_pairs": 5,
            "reranker_max_length": 64,
        },
        "latencia": {
            "consultas_por_corrida": 3,
            "lotes_reranker_por_corrida": 2,
            "tamano_lote_nli": 5,
            "contexto_resumen": "contexto sintetico",
        },
        "embeddings": [
            spec("A", "embedding", pooling="cls"),
            spec("B", "embedding", pooling="media"),
        ],
        "reranker": [spec("A", "reranker_cls")],
        "nli": [spec("A", "nli")],
    }
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(contenido, allow_unicode=True), encoding="utf-8")
    return ruta


class Ejecucion:
    """Ejecutor en proceso: mide con modelos falsos y cuenta los trabajos lanzados."""

    def __init__(self, ruta_config: Path, cache_datos: Path) -> None:
        self.ruta_config = ruta_config
        self.cache_datos = cache_datos
        self.trabajos: list[Trabajo] = []
        self._relojes = iter(range(1, 100_000))

    def __call__(self, trabajo: Trabajo) -> None:
        self.trabajos.append(trabajo)
        config = cargar_config(self.ruta_config)
        dataset = cargar_dataset(Path(config.dataset))
        secciones = {
            i: f.secciones for i, f in leer_fuentes_de_cache(dataset, self.cache_datos).items()
        }
        ejecutar_trabajo(
            trabajo,
            config,
            dataset,
            secciones,
            FabricaFalsa(),
            reloj=lambda: next(self._relojes) / 1000.0,
        )


@contextlib.contextmanager
def cliente_fuentes_de_prueba(cliente: httpx.Client | None) -> Iterator[httpx.Client]:
    """El cliente de las fuentes es siempre explícito; la verificación en Hugging Face se pide aparte."""
    if cliente is not None:
        yield cliente
        return
    with httpx.Client() as propio:
        yield propio


def correr(
    tmp_path: Path, ruta_config: Path, *, cliente: httpx.Client | None = None
) -> tuple[int, Ejecucion, Path]:
    cache = tmp_path / "cache"
    ejecucion = Ejecucion(ruta_config, cache)
    salida = tmp_path / "reporte.json"
    with cliente_fuentes_de_prueba(cliente) as descarga:
        codigo = medir.ejecutar_fase_a(
            ruta_config,
            tmp_path / "modelos",
            cache,
            salida,
            ejecucion,
            exportador_falso,
            descarga,
            cliente is not None,
            lambda: AHORA,
        )
    return codigo, ejecucion, salida


@pytest.fixture()
def dataset_sintetico(tmp_path: Path) -> Path:
    return preparar_dataset(tmp_path)


@pytest.mark.ac("US-012", 1)
@respx.mock(assert_all_called=False)
def test_fase_a_reporta_por_candidato_memoria_p95_licencia_version_y_metrica_ac1(
    respx_mock: respx.MockRouter, tmp_path: Path, dataset_sintetico: Path
) -> None:
    mock_fuentes(respx_mock)
    respx_mock.get(url__regex=r"https://huggingface\.co/api/models/falso/.+/revision/.+").mock(
        return_value=httpx.Response(
            200,
            json={
                "sha": REVISION,
                "tags": ["license:mit"],
                "cardData": {"license": "mit"},
                "siblings": [{"rfilename": "model.safetensors", "size": 123}],
            },
        )
    )
    ruta = escribir_config(tmp_path, dataset_sintetico)

    with httpx.Client() as cliente:
        codigo, ejecucion, salida = correr(tmp_path, ruta, cliente=cliente)

    reporte = json.loads(salida.read_text(encoding="utf-8"))
    assert codigo == 0
    assert len(ejecucion.trabajos) == (2 + 1 + 1) * 2 * 3  # candidatos x cuantizaciones x corridas
    candidato = reporte["componentes"]["embeddings"]["detalle"]["A@int8"]
    assert candidato["corridas"] == 3 and candidato["rss_max_mb"] > 0 and candidato["p95_ms"] > 0
    assert (
        candidato["fuente"]["licencia"] == "mit"
        and candidato["revision"] == REVISION
        and candidato["fuente"]["revision_coincide"]
    )
    assert 0.0 <= candidato["calidad"]["metricas"]["total"]["recall_at_10"] <= 1.0
    assert (
        reporte["componentes"]["nli"]["detalle"]["A@int8"]["calidad"]["exactitud"]["total"] == 1.0
    )
    assert (
        reporte["componentes"]["reranker"]["detalle"]["A@fp32"]["calidad"][
            "metricas_densas_mismo_conjunto"
        ]["total"]["n"]
        > 0
    )


@respx.mock(assert_all_called=False)
def test_fase_a_el_reporte_no_contiene_textos_de_preguntas_ni_fragmentos(
    respx_mock: respx.MockRouter, tmp_path: Path, dataset_sintetico: Path
) -> None:
    mock_fuentes(respx_mock)
    ruta = escribir_config(tmp_path, dataset_sintetico)

    _, _, salida = correr(tmp_path, ruta)

    crudo = salida.read_text(encoding="utf-8")
    for texto in (
        "valor de P interaction en SET",
        "tema inexistente",
        "Valor de P interaction = 0.028",
        "Titulo sintetico",
    ):
        assert texto not in crudo


@pytest.mark.ac("US-012", 13)
@respx.mock(assert_all_called=False)
def test_fase_a_separa_el_puntaje_maximo_de_las_preguntas_sin_respuesta_ac13(
    respx_mock: respx.MockRouter, tmp_path: Path, dataset_sintetico: Path
) -> None:
    mock_fuentes(respx_mock)
    ruta = escribir_config(tmp_path, dataset_sintetico)

    _, _, salida = correr(tmp_path, ruta)

    metricas = json.loads(salida.read_text())["componentes"]["embeddings"]["detalle"]["A@int8"][
        "calidad"
    ]["metricas"]
    assert metricas["sin_evidencia_puntaje_maximo"]["n"] == 1
    assert metricas["sin_evidencia_puntaje_maximo"]["maximo"] is not None


@pytest.mark.ac("US-012", 9)
@respx.mock(assert_all_called=False)
def test_fase_a_con_manifiesto_sin_clase_sintetica_termina_distinto_de_cero_sin_medir_ac9(
    respx_mock: respx.MockRouter, tmp_path: Path, dataset_sintetico: Path
) -> None:
    mock_fuentes(respx_mock)
    manifiesto = dataset_sintetico / "manifest.yaml"
    contenido = yaml.safe_load(manifiesto.read_text())
    contenido.pop("clase")
    manifiesto.write_text(yaml.safe_dump(contenido))
    ruta = escribir_config(tmp_path, dataset_sintetico)

    codigo, ejecucion, salida = correr(tmp_path, ruta)

    assert codigo == medir.SALIDA_DATASET and ejecucion.trabajos == [] and not salida.exists()


@pytest.mark.ac("US-012", 13)
@respx.mock(assert_all_called=False)
def test_fase_a_con_una_cita_ausente_termina_con_codigo_1_sin_medir_ac13(
    respx_mock: respx.MockRouter, tmp_path: Path, dataset_sintetico: Path
) -> None:
    mock_fuentes(respx_mock)
    golden = dataset_sintetico / "g.yaml"
    contenido = yaml.safe_load(golden.read_text())
    contenido["preguntas"][0]["evidencia"][0]["cita"] = "frase que no existe"
    golden.write_text(yaml.safe_dump(contenido, allow_unicode=True))
    ruta = escribir_config(tmp_path, dataset_sintetico)

    codigo, ejecucion, _ = correr(tmp_path, ruta)

    assert codigo == medir.SALIDA_CITA and ejecucion.trabajos == []


@pytest.mark.ac("US-012", 5)
@respx.mock(assert_all_called=False)
def test_fase_a_con_todos_los_candidatos_descartados_termina_distinto_de_cero_y_declara_sin_candidato_ac5(
    respx_mock: respx.MockRouter, tmp_path: Path, dataset_sintetico: Path
) -> None:
    mock_fuentes(respx_mock)
    respx_mock.get(url__regex=r"https://huggingface\.co/api/models/.+").mock(
        return_value=httpx.Response(
            200, json={"sha": REVISION, "tags": ["license:cc-by-nc-4.0"], "siblings": []}
        )
    )
    ruta = escribir_config(tmp_path, dataset_sintetico, licencias=("mit",))

    with httpx.Client() as cliente:
        codigo, _, salida = correr(tmp_path, ruta, cliente=cliente)

    reporte = json.loads(salida.read_text())
    assert codigo == medir.SALIDA_SIN_CANDIDATO
    assert reporte["componentes"]["embeddings"]["seleccion"]["elegido"] == "sin_candidato"
    assert (
        "embeddings" in reporte["componentes_sin_candidato"]
        and "reranker" in reporte["componentes_sin_candidato"]
    )
    assert all(
        d["motivo"] == "licencia"
        for d in reporte["componentes"]["embeddings"]["seleccion"]["descartados"]
    )


@pytest.mark.ac("US-012", 2)
@respx.mock(assert_all_called=False)
def test_fase_a_los_descartes_del_reporte_llevan_motivo_y_cifra_ac2(
    respx_mock: respx.MockRouter, tmp_path: Path, dataset_sintetico: Path
) -> None:
    mock_fuentes(respx_mock)
    ruta = escribir_config(tmp_path, dataset_sintetico, limite_gb=0.0001)

    codigo, _, salida = correr(tmp_path, ruta)

    descartes = json.loads(salida.read_text())["componentes"]["nli"]["seleccion"]["descartados"]
    assert codigo == medir.SALIDA_SIN_CANDIDATO
    assert descartes and descartes[0]["motivo"] == "memoria" and "GB" in descartes[0]["cifra"]


def test_fase_a_separa_el_cliente_de_las_fuentes_de_la_verificacion_en_la_fuente_de_los_modelos() -> (
    None
):
    import inspect

    parametros = inspect.signature(medir.ejecutar_fase_a).parameters

    assert parametros["cliente_fuentes"].default is inspect.Parameter.empty
    assert parametros["verificar_fuente"].default is inspect.Parameter.empty


@respx.mock(assert_all_called=False)
def test_fase_a_cada_bloque_sin_evidencia_declara_la_escala_de_su_puntaje(
    respx_mock: respx.MockRouter, tmp_path: Path, dataset_sintetico: Path
) -> None:
    mock_fuentes(respx_mock)
    respx_mock.get(url__regex=r"https://huggingface\.co/api/models/falso/.+/revision/.+").mock(
        return_value=httpx.Response(
            200,
            json={
                "sha": REVISION,
                "tags": ["license:mit"],
                "cardData": {"license": "mit"},
                "siblings": [],
            },
        )
    )
    ruta = escribir_config(tmp_path, dataset_sintetico)

    with httpx.Client() as cliente:
        _, _, salida = correr(tmp_path, ruta, cliente=cliente)

    componentes = json.loads(salida.read_text())["componentes"]
    embeddings = componentes["embeddings"]["detalle"]["A@int8"]["calidad"]["metricas"]
    reranker = componentes["reranker"]["detalle"]["A@int8"]["calidad"]
    assert embeddings["sin_evidencia_puntaje_maximo"]["escala_puntaje"] == "coseno_denso"
    assert (
        reranker["metricas"]["sin_evidencia_puntaje_maximo"]["escala_puntaje"]
        == "relevance_score_sigmoide"
    )
    assert (
        reranker["metricas_densas_mismo_conjunto"]["sin_evidencia_puntaje_maximo"]["escala_puntaje"]
        == "coseno_denso"
    )


@respx.mock(assert_all_called=False)
def test_fase_a_el_trabajo_de_embeddings_recibe_y_escribe_su_carpeta_de_candidatos(
    respx_mock: respx.MockRouter, tmp_path: Path, dataset_sintetico: Path
) -> None:
    mock_fuentes(respx_mock)
    ruta = escribir_config(tmp_path, dataset_sintetico)

    _, ejecucion, _ = correr(tmp_path, ruta)

    con_calidad = [t for t in ejecucion.trabajos if t.spec.componente == "embeddings" and t.calidad]
    assert con_calidad and all(
        t.candidatos_dir is not None and (t.candidatos_dir / "chunks.json").exists()
        for t in con_calidad
    )
    assert not any(
        c.name.endswith("-candidatos") and not (c / "chunks.json").exists()
        for c in (tmp_path / "cache" / "adr39" / "corridas").iterdir()
    )


@respx.mock(assert_all_called=False)
def test_fase_a_reanudada_no_repite_los_trabajos_ya_medidos(
    respx_mock: respx.MockRouter, tmp_path: Path, dataset_sintetico: Path
) -> None:
    mock_fuentes(respx_mock)
    ruta = escribir_config(tmp_path, dataset_sintetico)
    correr(tmp_path, ruta)

    _, segunda, _ = correr(tmp_path, ruta)

    assert segunda.trabajos == []


def test_ejecutar_trabajo_con_componente_desconocido_lanza_error(
    tmp_path: Path, dataset_sintetico: Path
) -> None:
    import dataclasses

    config = cargar_config(escribir_config(tmp_path, dataset_sintetico))
    spec = dataclasses.replace(config.candidatos["embeddings"][0], componente="otro")
    trabajo = Trabajo(spec, "int8", 1, False, tmp_path, tmp_path, tmp_path / "salida.json")

    with pytest.raises(ValueError, match="componente"):
        ejecutar_trabajo(
            trabajo,
            config,
            cargar_dataset(dataset_sintetico),
            {},
            FabricaFalsa(),
            reloj=lambda: 0.0,
        )
