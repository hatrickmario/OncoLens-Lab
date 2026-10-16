"""Medición del reranker sobre chunks de 1024 tokens (decisión 2026-10-20): reglas puras y humo con modelos falsos."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from app.evaluation.config_medicion import ModeloSpec
from app.evaluation.dataset_loader import cargar_dataset
from app.evaluation.fase_a3 import (
    SALIDA_OK,
    ConfigA3,
    Escenario,
    ReglasA3,
    TrabajoA3,
    cargar_config_a3,
    derivar_conclusiones,
    ejecutar_fase_a3,
    ejecutar_trabajo_a3,
    evaluar_extremo_a_extremo,
    redondear_hacia_arriba,
)
from app.scripts.adr39_fetch_sources import descargar_fuentes
from datos_sinteticos import mock_fuentes, preparar_dataset
from modelos_falsos import FabricaFalsa

AHORA = datetime(2026, 10, 20, 9, 0, tzinfo=timezone.utc)
REGLAS = ReglasA3(250.0, 10_000.0, 15_000.0, 1_000.0, 2_000.0, {"embeddings": 59.0, "nli": 248.0})
ESCENARIOS = (
    Escenario("base", 4, 512, 24, "referencia"),
    Escenario("vigente", 8, 512, 24, "vigente"),
    Escenario("menos-pares", 8, 512, 12, "palanca"),
    Escenario("lento-y-peor", 8, 512, 8, "palanca"),
)
EMB = ModeloSpec("A", "embeddings", "falso/emb", "a" * 40, "embedding", 512, pooling="cls")
RER = ModeloSpec("A", "reranker", "falso/rer", "b" * 40, "reranker_cls", 512)


def config(**cambios: Any) -> ConfigA3:
    base = dict(
        dataset="", semilla_bootstrap=3, bootstrap_repeticiones=30, corridas=3, calentamiento=1, hilos_cpu=1, lotes_por_corrida=3,
        k=10, tolerancia_empate=0.02, cuantizacion="int8", embedding=EMB, reranker=RER, escenarios=ESCENARIOS, reglas=REGLAS,
        reporte="reports/adr39/x.json",
    )
    base.update(cambios)
    return ConfigA3(**base)  # type: ignore[arg-type]


def agregado(recall: float, p95: float) -> dict[str, Any]:
    return {"p95_ms": p95, "calidad": {"metricas": {"total": {"recall_at_10": recall}}}}


def test_redondear_hacia_arriba_al_multiplo_devuelve_el_siguiente_multiplo() -> None:
    assert redondear_hacia_arriba(3183.0, 250.0) == 3250.0
    assert redondear_hacia_arriba(3250.0, 250.0) == 3250.0


def test_extremo_a_extremo_marca_riesgo_alto_cuando_el_margen_es_menor_al_umbral() -> None:
    alto = evaluar_extremo_a_extremo(4_700.0, REGLAS)  # 59 + 248 + 4700 + 10000 = 15007 ms
    aceptable = evaluar_extremo_a_extremo(1_000.0, REGLAS)

    assert alto["p95_estimado_ms"] == 15_007.0 and alto["riesgo"] == "alto"
    assert aceptable["margen_ms"] == pytest.approx(3_693.0) and aceptable["riesgo"] == "aceptable"


def test_conclusiones_fijan_el_presupuesto_del_vigente_si_su_recall_sostiene_la_base() -> None:
    agregados = {
        "base": agregado(0.60, 3000.0),
        "vigente": agregado(0.65, 3183.0),
        "menos-pares": agregado(0.64, 1700.0),
        "lento-y-peor": agregado(0.50, 900.0),
    }

    c = derivar_conclusiones(agregados, ESCENARIOS, config())

    assert c["presupuesto_reranker_ms"] == 3250.0
    viables = {p["escenario"]: p["viable"] for p in c["palancas"]}
    assert viables == {"base": False, "vigente": False, "menos-pares": True, "lento-y-peor": False}


def test_conclusiones_no_fijan_presupuesto_cuando_el_vigente_pierde_recall_frente_a_la_base() -> None:
    agregados = {"base": agregado(0.70, 3000.0), "vigente": agregado(0.60, 3183.0), "menos-pares": agregado(0.6, 1.0), "lento-y-peor": agregado(0.6, 1.0)}

    c = derivar_conclusiones(agregados, ESCENARIOS, config())

    assert c["calidad_del_vigente_sostiene_la_base"] is False
    assert c["presupuesto_reranker_ms"] is None


def test_la_configuracion_real_fija_los_escenarios_y_las_reglas_antes_de_medir() -> None:
    ruta = Path(__file__).resolve().parents[2] / "eval" / "configs" / "adr39-fase-a3.yaml"

    cfg = cargar_config_a3(ruta)

    assert cfg.reranker.modelo == "BAAI/bge-reranker-v2-m3"
    assert [e.rol for e in cfg.escenarios].count("vigente") == 1 and [e.rol for e in cfg.escenarios].count("referencia") == 1
    assert cfg.corridas == 3 and cfg.reglas.presupuesto_redondeo_ms == 250.0


@pytest.fixture()
def escenario(tmp_path: Path):
    with respx.mock(assert_all_called=False) as router:
        mock_fuentes(router)
        dataset = cargar_dataset(preparar_dataset(tmp_path))
        fuentes = descargar_fuentes(dataset, tmp_path / "cache", httpx.Client(), lambda: AHORA, dormir=lambda _s: None)
    return dataset, {i: f.secciones for i, f in fuentes.items()}, tmp_path


def test_la_fase_a3_escribe_un_reporte_con_cada_escenario_y_sus_conclusiones(escenario) -> None:
    dataset, secciones, tmp = escenario
    contador = iter(range(1, 100_000))
    fabrica = FabricaFalsa()
    cfg = config()

    def ejecutor(trabajo: TrabajoA3) -> None:
        ejecutar_trabajo_a3(trabajo, cfg, dataset, fabrica, lambda: next(contador) / 100.0)

    codigo = ejecutar_fase_a3(cfg, dataset, secciones, fabrica, tmp / "modelos", tmp / "datos", tmp / "a3.json", ejecutor, lambda: AHORA)

    reporte = json.loads((tmp / "a3.json").read_text())
    assert codigo == SALIDA_OK
    assert set(reporte["escenarios"]) == {e.id for e in ESCENARIOS}
    assert reporte["escenarios"]["vigente"]["corridas"] == 3
    conclusiones = reporte["conclusiones"]
    presupuesto = conclusiones["presupuesto_reranker_ms"]
    assert (presupuesto is not None) == conclusiones["calidad_del_vigente_sostiene_la_base"]
    assert presupuesto is None or (presupuesto > 0 and presupuesto % 250 == 0)
    assert "texto" not in json.dumps(reporte).lower().replace("textos", "")
    assert reporte["escenarios"]["vigente"]["determinista"] is True


def test_la_fase_a3_marca_no_determinista_el_escenario_cuyas_corridas_dan_huellas_distintas() -> None:
    from app.evaluation.fase_a import agregar_corridas

    corrida = {"rss_carga_mb": 1.0, "rss_max_mb": 2.0, "pico_rss_mb": 3.0, "latencia": {"p50_ms": 1.0, "p95_ms": 2.0}, "calidad": {}}

    agregado_a3 = agregar_corridas([{**corrida, "huella_sondas": "x"}, {**corrida, "huella_sondas": "y"}])

    assert agregado_a3["determinista"] is False


def test_la_fase_a3_anota_como_no_medible_el_escenario_cuyo_proceso_muere_y_sigue_con_los_demas(escenario) -> None:
    from app.evaluation.fase_a3 import TrabajoFallido

    dataset, secciones, tmp = escenario
    contador = iter(range(1, 100_000))
    fabrica = FabricaFalsa()
    cfg = config()

    def ejecutor(trabajo: TrabajoA3) -> None:
        if trabajo.escenario.id == "menos-pares":
            raise TrabajoFallido("código -9")
        ejecutar_trabajo_a3(trabajo, cfg, dataset, fabrica, lambda: next(contador) / 100.0)

    codigo = ejecutar_fase_a3(cfg, dataset, secciones, fabrica, tmp / "modelos", tmp / "datos", tmp / "a3.json", ejecutor, lambda: AHORA)

    reporte = json.loads((tmp / "a3.json").read_text())
    assert codigo == SALIDA_OK
    assert reporte["escenarios_no_medibles"]["menos-pares"]["estado"] == "no_medible"
    assert "menos-pares" not in reporte["escenarios"] and "vigente" in reporte["escenarios"]


def test_vectores_en_cache_codifica_una_vez_y_reutiliza_el_archivo(tmp_path: Path) -> None:
    from app.evaluation.medicion_modelos import vectores_en_cache

    embedder = FabricaFalsa().embedder(EMB, tmp_path, "int8", 1)
    original = embedder.codificar
    llamadas: list[int] = []
    embedder.codificar = lambda textos, *, consulta: (llamadas.append(len(textos)), original(textos, consulta=consulta))[1]  # type: ignore[method-assign]

    primero = vectores_en_cache(tmp_path / "v.npy", ["uno dos", "tres"], embedder)
    segundo = vectores_en_cache(tmp_path / "v.npy", ["uno dos", "tres"], embedder)

    assert llamadas == [2] and (primero == segundo).all()


def test_vectores_en_cache_recodifica_cuando_la_cache_no_corresponde_al_numero_de_chunks(tmp_path: Path) -> None:
    from app.evaluation.medicion_modelos import vectores_en_cache

    embedder = FabricaFalsa().embedder(EMB, tmp_path, "int8", 1)
    vectores_en_cache(tmp_path / "v.npy", ["uno"], embedder)

    vectores = vectores_en_cache(tmp_path / "v.npy", ["uno", "dos", "tres"], embedder)

    assert vectores.shape[0] == 3


def test_preparar_candidatos_no_reutiliza_rankings_de_otro_pool(escenario) -> None:
    from app.evaluation.fase_a3 import preparar_candidatos

    dataset, secciones, tmp = escenario
    destino = tmp / "candidatos"
    args = (config(), 4, None, dataset, secciones, FabricaFalsa(), tmp, tmp / "vectores", destino)

    preparar_candidatos(*(args[:2] + (1,) + args[3:]))
    con_uno = json.loads((destino / "rankings.json").read_text())
    preparar_candidatos(*(args[:2] + (2,) + args[3:]))
    con_dos = json.loads((destino / "rankings.json").read_text())

    assert {len(v) for v in con_uno.values()} == {1} and {len(v) for v in con_dos.values()} == {2}


def test_conclusiones_aplican_la_regla_de_presupuesto_al_escenario_adoptado() -> None:
    agregados = {
        "base": agregado(0.667, 3947.0),
        "vigente": agregado(0.652, 8252.0),
        "menos-pares": agregado(0.696, 4259.0),
        "lento-y-peor": agregado(0.50, 900.0),
    }
    agregados["menos-pares"]["rss_max_mb"] = 2642.0

    c = derivar_conclusiones(agregados, ESCENARIOS, config(escenario_adoptado="menos-pares"))

    adoptado = c["adoptado"]
    assert adoptado["presupuesto_reranker_ms"] == 4500.0  # 4259 redondeado hacia arriba a múltiplos de 250
    assert adoptado["calidad_sostiene_la_base"] is True
    assert adoptado["extremo_a_extremo_con_p95_medido"]["p95_estimado_ms"] == pytest.approx(14_566.0)
    assert adoptado["extremo_a_extremo_con_presupuesto"]["riesgo"] == "alto"
