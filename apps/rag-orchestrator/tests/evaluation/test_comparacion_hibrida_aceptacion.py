"""Aceptación de la comparación híbrida vs densa en la misma corrida (US-133 AC-1…AC-5, L1D-245; ADR-45 P1, P2).

Todo con adapters falsos de *dense* y *sparse*: la corrida real con modelos locales es manual (US-233a).
"""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "s4-hibrida-fake.yaml"
FIXTURE = RAIZ_REPO / "data" / "eval" / "fx-t5a-a"
BRAZOS = ["A0", "A2", "A2b"]
METRICAS_DE_DIFERENCIA = {"recall_at_10_total", "recall_at_10_es_a_en", "mrr"}


def correr(config: Path, salida: Path, *extra: str) -> int:
    return main(
        [
            "--config",
            str(config),
            "--suite",
            "all",
            "--report",
            "json",
            "--salida",
            str(salida),
            *extra,
        ],
        reloj=RelojFijo(),
    )


def leer_comparacion(salida: Path) -> dict[str, Any]:
    archivos = list(salida.glob("*.json"))
    assert len(archivos) == 1, "la corrida debía escribir un solo reporte"
    reporte = json.loads(archivos[0].read_text(encoding="utf-8"))
    assert "comparacion_recuperacion" in reporte, "el reporte no trae la comparación de brazos"
    return reporte["comparacion_recuperacion"]


def por_nombre(comparacion: dict[str, Any]) -> dict[str, Any]:
    return {brazo["nombre"]: brazo for brazo in comparacion["brazos"]}


def sha256_de(ruta: Path) -> str:
    return hashlib.sha256(ruta.read_bytes()).hexdigest()


def escribir_particion(
    directorio: Path, golden: Path, asignacion: dict[str, list[str]], *, huella: str | None = None
) -> Path:
    directorio.mkdir(parents=True, exist_ok=True)
    (directorio / "particion.yaml").write_text(
        yaml.safe_dump(
            {
                "clase": "sintetico",
                "golden_sha256": huella or sha256_de(golden),
                "asignacion": asignacion,
            }
        ),
        encoding="utf-8",
    )
    (directorio / "manifest.yaml").write_text(
        yaml.safe_dump(
            {
                "clase": "sintetico",
                "nombre": "particion-de-prueba",
                "origen": str(golden.parent),
                "archivo_golden": golden.name,
            }
        ),
        encoding="utf-8",
    )
    return directorio


def config_con(tmp_path: Path, dataset: Path, particion: Path, **cambios: Any) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["dataset"] = {
        "ruta": str(dataset),
        "subconjunto": "desarrollo",
        "particion": str(particion),
    }
    for ruta, valor in cambios.items():
        destino = crudo
        *camino, hoja = ruta.split(".")
        for parte in camino:
            destino = destino[parte]
        destino[hoja] = valor
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


@pytest.mark.ac("US-133", 1)
def test_comparacion_de_tres_brazos_trae_metricas_y_diferencias_frente_a_a0_en_la_misma_corrida(
    tmp_path: Path,
) -> None:
    codigo = correr(CONFIG, tmp_path)

    comparacion = leer_comparacion(tmp_path)
    assert codigo == 0
    assert [b["nombre"] for b in comparacion["brazos"]] == BRAZOS
    brazos = por_nombre(comparacion)
    for brazo in brazos.values():
        total, es_a_en = brazo["recuperacion"]["total"], brazo["recuperacion"]["es_a_en"]
        assert {"recall_at_10", "mrr"} <= set(total) and "recall_at_10" in es_a_en
    assert "diferencia_frente_a_a0" not in brazos["A0"]
    for nombre in ("A2", "A2b"):
        diferencia = brazos[nombre]["diferencia_frente_a_a0"]
        assert set(diferencia) == METRICAS_DE_DIFERENCIA
        esperada = (
            brazos[nombre]["recuperacion"]["total"]["recall_at_10"]
            - brazos["A0"]["recuperacion"]["total"]["recall_at_10"]
        )
        assert diferencia["recall_at_10_total"] == pytest.approx(esperada)
    assert "baseline" not in json.dumps(comparacion).lower()


# Corpus de dos pasajes: la rama dense prefiere el correcto (coseno) y la sparse el distractor (más términos en común).
CORPUS_DE_REGRESION = {
    "clase": "sintetico",
    "release": "rel-regresion-1",
    "corte": "2026-09-30",
    "documentos": [
        {"id": "doc-a", "titulo": "Documento correcto (test)", "cancer": "mama"},
        {"id": "doc-b", "titulo": "Documento distractor (test)", "cancer": "mama"},
    ],
    "chunks": [
        {"id": "ch-a-1", "documento": "doc-a", "texto": "alfa bravo"},
        {
            "id": "ch-b-1",
            "documento": "doc-b",
            "texto": "alfa bravo charlie delta echo foxtrot golf hotel india juliet kilo lima",
        },
    ],
}
PREGUNTA_DE_REGRESION = {
    "id": "RG-01",
    "idioma": "es",
    "cancer": "mama",
    "modo_acierto": "cualquiera",
    "pregunta": "alfa bravo charlie",
    "evidencia": [{"documento": "doc-a", "cita": "alfa bravo"}],
    "revisada_por_oncologo": False,
}


def dataset_de_prueba(
    destino: Path, preguntas: list[dict[str, Any]], corpus: dict[str, Any]
) -> Path:
    shutil.copytree(FIXTURE, destino)
    (destino / "corpus.yaml").write_text(yaml.safe_dump(corpus), encoding="utf-8")
    (destino / "preguntas.yaml").write_text(
        yaml.safe_dump({"clase": "sintetico", "preguntas": preguntas}), encoding="utf-8"
    )
    (destino / "propuestas.yaml").write_text(
        yaml.safe_dump({"clase": "sintetico", "propuestas": {}}), encoding="utf-8"
    )
    (destino / "prescriptivas.yaml").write_text(
        yaml.safe_dump({"clase": "sintetico", "salidas": []}), encoding="utf-8"
    )
    return destino


@pytest.mark.ac("US-133", 2)
def test_un_brazo_hibrido_peor_que_la_tolerancia_se_marca_como_retroceso_y_sale_con_codigo_distinto_de_cero(
    tmp_path: Path,
) -> None:
    dataset = dataset_de_prueba(tmp_path / "ds", [PREGUNTA_DE_REGRESION], CORPUS_DE_REGRESION)
    particion = escribir_particion(
        tmp_path / "part", dataset / "preguntas.yaml", {"desarrollo": ["RG-01"]}
    )
    brazos = [
        {"nombre": "A0", "RETRIEVAL_MODE": "dense"},
        {
            "nombre": "A2b",
            "RETRIEVAL_MODE": "hibrida",
            "RETRIEVAL_FUSION": "ponderada",
            "HYBRID_SPARSE_WEIGHT": 0.9,
        },
    ]
    config = config_con(
        tmp_path,
        dataset,
        particion,
        **{"umbrales.retrieval_top_k": 1, "comparacion.brazos": brazos},
    )

    codigo = correr(config, tmp_path / "salida")

    comparacion = leer_comparacion(tmp_path / "salida")
    brazo = por_nombre(comparacion)["A2b"]
    assert (
        brazo["diferencia_frente_a_a0"]["recall_at_10_total"] < -comparacion["tolerancia_retroceso"]
    )
    assert brazo["retroceso"] is True and comparacion["retroceso"] is True
    assert codigo != 0


def test_sin_retroceso_ningun_brazo_se_marca_y_el_codigo_de_salida_es_cero(tmp_path: Path) -> None:
    codigo = correr(CONFIG, tmp_path)

    comparacion = leer_comparacion(tmp_path)
    assert [b["retroceso"] for b in comparacion["brazos"]] == [False, False, False]
    assert comparacion["retroceso"] is False
    assert codigo == 0


@pytest.mark.ac("US-133", 3)
def test_cada_consulta_de_un_brazo_trae_el_modo_la_fusion_y_el_parametro_de_su_brazo(
    tmp_path: Path,
) -> None:
    correr(CONFIG, tmp_path)

    brazos = por_nombre(leer_comparacion(tmp_path))
    esperado = {
        "A0": ("dense", "ninguna", 0),
        "A2": ("hibrida", "rrf", 60),
        "A2b": ("hibrida", "ponderada", 0.3),
    }
    for nombre, (modo, fusion, parametro) in esperado.items():
        brazo = brazos[nombre]
        assert (brazo["retrievalMode"], brazo["fusion"], brazo["fusionParam"]) == (
            modo,
            fusion,
            parametro,
        )
        trazabilidad = brazo["trazabilidad"]
        assert trazabilidad["consultas"] == 5 and trazabilidad["coherentes"] == 5


@pytest.mark.ac("US-133", 4)
def test_dos_corridas_con_adapters_falsos_producen_las_mismas_metricas_en_los_tres_brazos(
    tmp_path: Path,
) -> None:
    correr(CONFIG, tmp_path / "uno")
    correr(CONFIG, tmp_path / "dos")

    assert leer_comparacion(tmp_path / "uno") == leer_comparacion(tmp_path / "dos")


@pytest.mark.ac("US-133", 5)
def test_la_comparacion_solo_evalua_desarrollo_y_no_lee_validacion_ni_prueba(
    tmp_path: Path,
) -> None:
    preguntas = yaml.safe_load((FIXTURE / "preguntas.yaml").read_text(encoding="utf-8"))[
        "preguntas"
    ]
    # Entradas de validación y prueba sin los campos obligatorios: leerlas como preguntas haría fallar la corrida.
    preguntas += [{"id": "FX-90"}, {"id": "FX-91"}]
    corpus = yaml.safe_load((FIXTURE / "corpus.yaml").read_text(encoding="utf-8"))
    dataset = dataset_de_prueba(tmp_path / "ds", preguntas, corpus)
    particion = escribir_particion(
        tmp_path / "part",
        dataset / "preguntas.yaml",
        {
            "desarrollo": ["FX-01", "FX-02", "FX-03", "FX-04", "FX-05"],
            "validacion": ["FX-06", "FX-90"],
            "prueba": ["FX-91"],
        },
    )
    config = config_con(tmp_path, dataset, particion)

    codigo = correr(config, tmp_path / "salida")

    brazos = por_nombre(leer_comparacion(tmp_path / "salida"))
    assert codigo == 0
    assert brazos["A0"]["recuperacion"]["total"]["n"] == 4  # FX-05 no tiene respuesta que acertar
    assert brazos["A0"]["trazabilidad"]["consultas"] == 5


def test_un_golden_que_no_coincide_con_la_huella_aborta_sin_producir_metricas(
    tmp_path: Path,
) -> None:
    dataset = dataset_de_prueba(
        tmp_path / "ds",
        yaml.safe_load((FIXTURE / "preguntas.yaml").read_text(encoding="utf-8"))["preguntas"],
        yaml.safe_load((FIXTURE / "corpus.yaml").read_text(encoding="utf-8")),
    )
    particion = escribir_particion(
        tmp_path / "part",
        dataset / "preguntas.yaml",
        {"desarrollo": ["FX-01", "FX-02"]},
        huella="0" * 64,
    )
    config = config_con(tmp_path, dataset, particion)

    codigo = correr(config, tmp_path / "salida")

    assert codigo != 0
    assert not (tmp_path / "salida").exists()


def test_la_comparacion_con_un_conjunto_distinto_de_desarrollo_es_una_configuracion_invalida(
    tmp_path: Path,
) -> None:
    config = config_con(
        tmp_path,
        FIXTURE,
        RAIZ_APP / "eval" / "particiones" / "fx-t5a-a",
        **{"dataset.subconjunto": "validacion"},
    )

    codigo = correr(config, tmp_path / "salida")

    assert codigo == 2
    assert not (tmp_path / "salida").exists()


def test_la_comparacion_informa_cuantas_preguntas_caen_en_sin_terminos_lexicos_por_brazo(
    tmp_path: Path,
) -> None:
    preguntas = yaml.safe_load((FIXTURE / "preguntas.yaml").read_text(encoding="utf-8"))[
        "preguntas"
    ]
    preguntas.append({**PREGUNTA_DE_REGRESION, "id": "FX-07", "pregunta": "¿qué es eso?"})
    corpus = yaml.safe_load((FIXTURE / "corpus.yaml").read_text(encoding="utf-8"))
    dataset = dataset_de_prueba(tmp_path / "ds", preguntas, corpus)
    particion = escribir_particion(
        tmp_path / "part",
        dataset / "preguntas.yaml",
        {"desarrollo": ["FX-01", "FX-02", "FX-03", "FX-04", "FX-05", "FX-07"]},
    )
    config = config_con(tmp_path, dataset, particion)

    codigo = correr(config, tmp_path / "salida")

    brazos = por_nombre(leer_comparacion(tmp_path / "salida"))
    assert codigo in (0, 3)
    assert brazos["A0"]["sin_terminos_lexicos"] == {"n": 0, "proporcion": 0.0}
    for nombre in ("A2", "A2b"):
        assert brazos[nombre]["sin_terminos_lexicos"]["n"] == 1
        assert brazos[nombre]["sin_terminos_lexicos"]["proporcion"] == pytest.approx(1 / 6)


def test_la_comparacion_informa_cero_y_no_nulo_cuando_ninguna_pregunta_queda_sin_terminos(
    tmp_path: Path,
) -> None:
    correr(CONFIG, tmp_path)

    for brazo in leer_comparacion(tmp_path)["brazos"]:
        assert brazo["sin_terminos_lexicos"] == {"n": 0, "proporcion": 0.0}
