"""Integridad del dataset `parafrasis-v1` de la familia `diagnostico` (US-276, L1D-334): sintético, con los pares y los
cuatro tipos de variación, con el par de la Demo 6, con cada cita literal en el corpus del dataset `s5-corpus-ampliado` y sin
lenguaje prescriptivo (RN-23). Sin modelos: la medición con el LLM y el NLI locales es la corrida base del S7."""

from __future__ import annotations

from collections import Counter
from datetime import date
from typing import Any

import pytest
import yaml

from app.evaluation.fuente_dataset import DatasetSuite, FuenteDatasetEnDirectorio
from app.evaluation.lenguaje_estricto import VerificadorEstricto
from app.evaluation.retrieval_metrics import contiene_cita
from app.infrastructure.lenguaje.terminos_prohibidos import cargar_lista_de_terminos
from tests.evaluation.conftest import RAIZ_REPO

DIRECTORIO = RAIZ_REPO / "data" / "eval" / "parafrasis-v1"
CORPUS = RAIZ_REPO / "data" / "eval" / "s5-corpus-ampliado"
CATALOGOS = RAIZ_REPO / "packages" / "clinical-catalogs"
TIPOS = {"coloquial_tecnico", "sin_tildes", "orden", "es_en"}
PARES_MINIMOS = 10


def _leer(nombre: str) -> dict[str, Any]:
    return yaml.safe_load((DIRECTORIO / nombre).read_text(encoding="utf-8"))  # type: ignore[no-any-return]


@pytest.fixture(scope="module")
def manifiesto() -> dict[str, Any]:
    return _leer("manifest.yaml")


@pytest.fixture(scope="module")
def pares() -> list[dict[str, Any]]:
    return _leer("pares.yaml")["pares"]  # type: ignore[no-any-return]


@pytest.fixture(scope="module")
def corpus() -> DatasetSuite:
    return FuenteDatasetEnDirectorio(CORPUS).cargar()


def test_el_dataset_declara_la_clase_sintetica_en_el_manifiesto_y_en_los_pares(
    manifiesto: dict[str, Any],
) -> None:
    assert manifiesto["clase"] == "sintetico"
    assert _leer("pares.yaml")["clase"] == "sintetico"


def test_el_manifiesto_apunta_al_corpus_del_dataset_s5_ampliado(manifiesto: dict[str, Any]) -> None:
    assert (RAIZ_REPO / manifiesto["corpus"]).resolve() == CORPUS.resolve()


def test_hay_los_pares_minimos_y_cada_tipo_de_variacion_tiene_al_menos_uno_con_ids_unicos(
    pares: list[dict[str, Any]],
) -> None:
    por_tipo = Counter(p["tipo"] for p in pares)

    assert len(pares) >= PARES_MINIMOS
    assert set(por_tipo) == TIPOS
    assert len({p["id"] for p in pares}) == len(pares)


def test_cada_par_reune_al_menos_dos_redacciones_distintas_con_idioma_declarado(
    pares: list[dict[str, Any]],
) -> None:
    for par in pares:
        preguntas = [r["pregunta"] for r in par["redacciones"]]
        assert len(preguntas) >= 2, par["id"]
        assert len(set(preguntas)) == len(preguntas), par["id"]
        assert {r["idioma"] for r in par["redacciones"]} <= {"es", "en"}, par["id"]
        assert len({r["id"] for r in par["redacciones"]}) == len(preguntas), par["id"]


def test_un_par_contiene_las_dos_redacciones_de_la_demo_6(
    manifiesto: dict[str, Any], pares: list[dict[str, Any]]
) -> None:
    par = next(p for p in pares if p["id"] == manifiesto["par_de_la_demo_6"])
    textos = " | ".join(r["pregunta"] for r in par["redacciones"])

    assert "complicaciones de la prostatectomía radical" in textos
    assert "complicaciones de la cirugía de prostata radical" in textos


def test_cada_cita_es_un_fragmento_literal_del_documento_esperado_en_el_corpus(
    pares: list[dict[str, Any]], corpus: DatasetSuite
) -> None:
    sin_fragmento = [
        par["id"]
        for par in pares
        for e in par["evidencia"]
        if not any(
            c.documento == e["documento"] and contiene_cita(c.texto, e["cita"])
            for c in corpus.chunks
        )
    ]

    assert sin_fragmento == []


def test_ninguna_redaccion_contiene_un_termino_prescriptivo_prohibido(
    pares: list[dict[str, Any]],
) -> None:
    verificador = VerificadorEstricto(cargar_lista_de_terminos(CATALOGOS))

    con_termino = [
        (par["id"], r["id"])
        for par in pares
        for r in par["redacciones"]
        if verificador.contiene_terminos(r["pregunta"], "rationale")
    ]

    assert con_termino == []


def test_el_dataset_se_declara_en_revision_provisional_con_rol_ia_y_fecha_iso(
    manifiesto: dict[str, Any],
) -> None:
    revision = manifiesto["revision_provisional"]

    assert set(revision) == {"rol", "fecha"}
    assert revision["rol"] == "ia"
    date.fromisoformat(str(revision["fecha"]))  # AAAA-MM-DD; si no es ISO lanza ValueError
