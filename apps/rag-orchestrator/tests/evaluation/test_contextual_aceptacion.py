"""Aceptación de la familia `contextual` de `evaluate` (US-271 AC-2, AC-4, AC-6 y AC-9; US-275 AC-4; L1D-329).

Adaptadores falsos y reloj congelado. Cada pregunta declara qué puntaje recibe su chunk en cada loop, así que cada fila tiene un
resultado conocido; la corrida es la real: el servicio de consulta con el segundo loop contextual, los términos del caso del
catálogo montado y el informe cerrado. Sin mocks de módulos propios.
"""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP
from tests.evaluation.mundo_contextual import (
    GeneradorQueFalla,
    Mundo,
    SINONIMOS,
    construir_mundo,
)
from tests.support.fakes import RelojFijo

CONFIG_FAKE = RAIZ_APP / "eval" / "configs" / "contextual-fake.yaml"


def correr(
    mundo: Mundo, salida: Path, nombre: str = "informe"
) -> tuple[int, dict[str, Any] | None]:
    codigo = main(
        [
            "--config",
            str(mundo.config),
            "--suite",
            "contextual",
            "--salida",
            str(salida),
            "--nombre-archivo",
            nombre,
        ],
        reloj=RelojFijo(),
        puertos_contextual=mundo.puertos,
    )
    json_escrito = salida / f"{nombre}.json"
    return codigo, json.loads(json_escrito.read_text("utf-8")) if json_escrito.exists() else None


def correr_ok(mundo: Mundo, salida: Path) -> dict[str, Any]:
    codigo, reporte = correr(mundo, salida)
    assert codigo == 0
    assert reporte is not None
    return reporte


def fila(reporte: dict[str, Any], identificador: str) -> dict[str, Any]:
    return next(f for f in reporte["preguntas"] if f["pregunta_id"] == identificador)


def sinonimo(reporte: dict[str, Any], identificador: str) -> dict[str, Any]:
    return next(s for s in reporte["sinonimos"] if s["pregunta_id"] == identificador)


@pytest.mark.ac("US-271", 9)
def test_contextual_da_para_cada_pregunta_de_sinonimos_el_umbral_superado_o_su_causa_cuando_corre_con_adaptadores_falsos(
    tmp_path: Path,
) -> None:
    reporte = correr_ok(construir_mundo(tmp_path), tmp_path / "salida")

    pasa, ausente, bajo = (sinonimo(reporte, p) for p, _ in SINONIMOS)
    assert (pasa["supero_umbral"], pasa["causa"]) == (True, None)
    assert (ausente["supero_umbral"], ausente["causa"]) == (False, "termino_ausente_del_corpus")
    assert (bajo["supero_umbral"], bajo["causa"]) == (False, "bajo_umbral_con_termino_en_corpus")
    assert [s["termino"] for s in reporte["sinonimos"]] == [t for _, t in SINONIMOS]
    assert all(s["supero_umbral"] or s["causa"] is not None for s in reporte["sinonimos"])
    assert {r["causa"] for r in reporte["regla_de_la_causa"]} == {
        None,
        "termino_ausente_del_corpus",
        "bajo_umbral_con_termino_en_corpus",
    }


@pytest.mark.ac("US-271", 9)
def test_contextual_fake_deja_a_cada_pregunta_de_sinonimos_con_el_umbral_superado_o_su_causa_sobre_el_dataset_del_repositorio(
    tmp_path: Path,
) -> None:
    codigo = main(
        [
            "--config",
            str(CONFIG_FAKE),
            "--suite",
            "contextual",
            "--salida",
            str(tmp_path),
            "--nombre-archivo",
            "informe",
        ],
        reloj=RelojFijo(),
    )

    reporte = json.loads((tmp_path / "informe.json").read_text("utf-8"))
    assert codigo == 0
    assert {s["pregunta_id"] for s in reporte["sinonimos"]} == {"CTX-C12", "CTX-C13", "CTX-C14"}
    assert all(s["supero_umbral"] or s["causa"] is not None for s in reporte["sinonimos"])
    assert len({f["pregunta_id"] for f in reporte["preguntas"]}) == 60
    assert reporte["configuracion"]["corpus"]["nombre"] == "s5-corpus-ampliado"
    assert reporte["configuracion"]["dataset"]["ruta"] == "data/eval/s5-corpus-ampliado"


@pytest.mark.ac("US-271", 3)
def test_contextual_deja_el_puntaje_en_null_nunca_en_cero_cuando_la_pregunta_sigue_sin_evidencia(
    tmp_path: Path,
) -> None:
    reporte = correr_ok(construir_mundo(tmp_path), tmp_path / "salida")

    sin_evidencia = fila(reporte, "CTX-A01")
    assert (sin_evidencia["estado"], sin_evidencia["supero_umbral"]) == ("sin_evidencia", False)
    assert sin_evidencia["top_relevance_score"] is None
    con_evidencia = fila(reporte, "CTX-C12")
    assert (con_evidencia["estado"], con_evidencia["supero_umbral"]) == ("con_evidencia", True)
    assert con_evidencia["top_relevance_score"] == 0.9


@pytest.mark.ac("US-271", 2)
@pytest.mark.ac("US-271", 4)
@pytest.mark.ac("US-275", 4)
def test_contextual_da_los_recuentos_por_clase_y_el_segundo_loop_usado_cuando_la_expansion_esta_activa(
    tmp_path: Path,
) -> None:
    reporte = correr_ok(construir_mundo(tmp_path, expansion=True), tmp_path / "salida")

    assert fila(reporte, "CTX-G01")["segundo_loop"] == "contextual"
    assert fila(reporte, "CTX-G01")["estado"] == "con_evidencia"
    assert all(
        fila(reporte, p)["segundo_loop"] == "ninguno"
        for p in ("CTX-A01", "CTX-C12", "CTX-C13", "CTX-C14")
    )
    esperado = {
        ("total", "generica"): (1, 1),
        ("total", "con_tema"): (
            0,
            1,
        ),  # los falsos positivos: adversarias que no debían tener evidencia
        ("total", "control"): (1, 3),
        ("mama-completo", "generica"): (1, 1),
        ("mama-completo", "con_tema"): (0, 1),
        ("mama-completo", "control"): (1, 3),
    }
    assert {
        (r["ambito"], r["clase"]): (r["con_evidencia"], r["total"]) for r in reporte["recuentos"]
    } == esperado
    assert reporte["configuracion"]["expansion_habilitada"] is True


@pytest.mark.ac("US-271", 2)
@pytest.mark.ac("US-271", 4)
@pytest.mark.ac("US-275", 4)
def test_contextual_no_usa_el_segundo_loop_contextual_cuando_la_expansion_esta_apagada(
    tmp_path: Path,
) -> None:
    reporte = correr_ok(construir_mundo(tmp_path, expansion=False), tmp_path / "salida")

    assert all(f["segundo_loop"] == "ninguno" for f in reporte["preguntas"])
    assert fila(reporte, "CTX-G01")["estado"] == "sin_evidencia"
    assert fila(reporte, "CTX-G01")["top_relevance_score"] is None
    generica = next(
        r for r in reporte["recuentos"] if (r["ambito"], r["clase"]) == ("total", "generica")
    )
    assert (generica["con_evidencia"], generica["total"]) == (0, 1)
    assert reporte["configuracion"]["expansion_habilitada"] is False


@pytest.mark.ac("US-271", 6)
def test_contextual_no_lleva_texto_de_preguntas_chunks_ni_terminos_del_caso_en_el_informe(
    tmp_path: Path,
) -> None:
    mundo = construir_mundo(tmp_path)
    salida = tmp_path / "salida"

    correr_ok(mundo, salida)

    for archivo in (salida / "informe.json", salida / "informe.md"):
        contenido = archivo.read_text("utf-8")
        assert not [t for t in mundo.textos if t in contenido], archivo.name


@pytest.mark.ac("US-271", 6)
def test_contextual_termina_con_codigo_distinto_de_cero_y_sin_cifras_cuando_el_dataset_no_es_sintetico(
    tmp_path: Path,
) -> None:
    mundo = construir_mundo(tmp_path, clase="real_anonimizado")

    codigo, reporte = correr(mundo, tmp_path / "salida")

    assert codigo != 0
    assert reporte is None
    assert not (tmp_path / "salida").exists() or not list((tmp_path / "salida").iterdir())


@pytest.mark.ac("US-271", 9)
def test_contextual_nombra_la_pregunta_y_el_termino_y_no_escribe_cifras_cuando_el_termino_no_esta_en_el_catalogo(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    mundo = construir_mundo(tmp_path, sinonimos=(("CTX-C12", "inexistente"),))

    codigo, reporte = correr(mundo, tmp_path / "salida")

    error = capsys.readouterr().err
    assert codigo != 0
    assert reporte is None
    assert "CTX-C12" in error and "inexistente" in error


@pytest.mark.ac("US-271", 9)
def test_contextual_da_termino_ausente_cuando_el_unico_chunk_con_el_termino_es_de_otro_tipo_de_cancer(
    tmp_path: Path,
) -> None:
    reporte = correr_ok(
        construir_mundo(tmp_path, casos=("prostata-con-grado",)), tmp_path / "salida"
    )

    for pregunta in (
        "CTX-C12",
        "CTX-C14",
    ):  # sus chunks son de mama: la recuperación del caso de próstata no los ve
        fila_de_sinonimo = sinonimo(reporte, pregunta)
        assert (fila_de_sinonimo["supero_umbral"], fila_de_sinonimo["causa"]) == (
            False,
            "termino_ausente_del_corpus",
        )


@pytest.mark.ac("US-271", 9)
def test_contextual_cuenta_la_salida_invalida_sin_contarla_como_con_evidencia_cuando_el_generador_falla(
    tmp_path: Path,
) -> None:
    mundo = construir_mundo(tmp_path)
    mundo = replace(mundo, puertos=replace(mundo.puertos, generador=GeneradorQueFalla()))

    reporte = correr_ok(mundo, tmp_path / "salida")

    invalida = fila(reporte, "CTX-C12")
    assert (invalida["estado"], invalida["supero_umbral"]) == ("salida_invalida", True)
    assert (invalida["top_relevance_score"], invalida["segundo_loop"]) == (None, None)
    assert reporte["salidas_invalidas"] == 2  # CTX-C12 y CTX-G01 (segundo loop) llegan al generador
    control = next(
        r for r in reporte["recuentos"] if (r["ambito"], r["clase"]) == ("total", "control")
    )
    assert (control["con_evidencia"], control["total"]) == (0, 3)


@pytest.mark.ac("US-271", 9)
def test_contextual_registra_el_corpus_el_catalogo_y_los_umbrales_de_la_corrida(
    tmp_path: Path,
) -> None:
    reporte = correr_ok(construir_mundo(tmp_path), tmp_path / "salida")

    configuracion = reporte["configuracion"]
    assert configuracion["dataset"] == {
        "nombre": "corpus-contextual-prueba",
        "version": "1",
        "ruta": "corpus",
    }
    assert configuracion["corpus"] == {
        "nombre": "corpus-contextual-prueba",
        "version": "1",
        "release": "rel-prueba-1",
        "recuento_de_chunks": 5,
    }
    assert configuracion["catalogVersion"] == "2026.10.0"
    assert configuracion["umbrales"]["relevanceThreshold"] == 0.3
    assert configuracion["umbrales"]["rerankerMaxPairs"] == 20
    assert configuracion["casos"] == ["mama-completo"]
    assert configuracion["expansion"] == {
        "campos": ["tipo", "estadio", "biomarcador_principal"],
        "formato": "plano",
    }
    assert reporte["validacion"]["rotulo"] == "no_validada"


@pytest.mark.ac("US-271", 9)
def test_contextual_da_el_mismo_informe_byte_a_byte_cuando_corre_dos_veces_con_la_misma_configuracion(
    tmp_path: Path,
) -> None:
    mundo = construir_mundo(tmp_path)

    correr_ok(mundo, tmp_path / "uno")
    correr_ok(mundo, tmp_path / "dos")

    for extension in ("json", "md"):
        assert (tmp_path / "uno" / f"informe.{extension}").read_bytes() == (
            tmp_path / "dos" / f"informe.{extension}"
        ).read_bytes()
