"""Integridad del dataset S5 sobre el corpus ampliado (US-120, L1D-119): el corpus sale de ``data/raw/s3`` y cada pregunta cita
un fragmento que existe. Sin modelos: la calibración con el LLM y el NLI locales es la corrida nocturna (D5-08)."""

from __future__ import annotations

from collections import Counter

import pytest
import yaml

from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.fuente_dataset import DatasetSuite, FuenteDatasetEnDirectorio
from app.infrastructure.seed_manifest.lector import leer_manifiesto
from tests.evaluation.conftest import RAIZ_APP
from tests.support.contract import RAIZ_REPOSITORIO

DIRECTORIO = RAIZ_REPOSITORIO / "data/eval/s5-corpus-ampliado"
CORPUS_S3 = RAIZ_REPOSITORIO / "data/raw/s3"
CONFIG = RAIZ_APP / "eval" / "configs" / "s5-calibracion.yaml"
TIPOS = ("mama", "prostata")


def _plano(texto: str) -> str:
    return " ".join(texto.split())


@pytest.fixture(scope="module")
def dataset() -> DatasetSuite:
    return FuenteDatasetEnDirectorio(DIRECTORIO).cargar()


def test_el_dataset_s5_declara_la_clase_sintetica_y_carga_sin_error(dataset: DatasetSuite) -> None:
    assert dataset.clase == "sintetico"
    assert dataset.nombre == "s5-corpus-ampliado"


def test_la_calibracion_del_s5_se_corre_sobre_el_corpus_ampliado() -> None:
    config = cargar_config_suite(CONFIG)

    assert config.dataset.resolve() == DIRECTORIO.resolve()


def test_el_corpus_del_dataset_tiene_un_documento_por_entrada_del_manifiesto_ampliado(
    dataset: DatasetSuite,
) -> None:
    manifiesto = leer_manifiesto(CORPUS_S3 / "manifest.yaml")

    assert {d.id for d in dataset.documentos} == {d.document_key for d in manifiesto}
    assert {d.id: d.titulo for d in dataset.documentos} == {
        d.document_key: d.title for d in manifiesto
    }
    assert {d.id: d.cancer for d in dataset.documentos} == {
        d.document_key: d.cancer_type_tags[0] for d in manifiesto
    }


def test_cada_fragmento_del_corpus_es_un_extracto_literal_del_texto_de_su_documento(
    dataset: DatasetSuite,
) -> None:
    manifiesto = {d.document_key: d for d in leer_manifiesto(CORPUS_S3 / "manifest.yaml")}
    textos = {
        clave: _plano((CORPUS_S3 / d.ruta_texto).read_text(encoding="utf-8"))
        for clave, d in manifiesto.items()
        if d.ruta_texto
    }

    ajenos = [c.id for c in dataset.chunks if _plano(c.texto) not in textos[c.documento]]

    assert ajenos == []


def test_todo_documento_del_corpus_aporta_al_menos_un_fragmento_y_el_corpus_supera_el_mayor_top_k_de_la_grilla(
    dataset: DatasetSuite,
) -> None:
    con_fragmentos = {c.documento for c in dataset.chunks}
    mayor_top_k = max(cargar_config_suite(CONFIG).barrido.retrieval_top_k_grid)  # type: ignore[union-attr]

    assert con_fragmentos == {d.id for d in dataset.documentos}
    assert len(dataset.chunks) > mayor_top_k


def test_cada_cita_de_cada_pregunta_es_literal_en_un_fragmento_del_documento_esperado(
    dataset: DatasetSuite,
) -> None:
    por_documento: dict[str, str] = {}
    for chunk in dataset.chunks:
        por_documento[chunk.documento] = (
            por_documento.get(chunk.documento, "") + "\n" + _plano(chunk.texto)
        )

    sin_cita = [
        (p.id, e.documento)
        for p in dataset.preguntas
        for e in p.evidencia
        if _plano(e.cita) not in por_documento.get(e.documento, "")
    ]

    assert sin_cita == []


def test_el_dataset_cubre_cada_tipo_e_idioma_y_tiene_preguntas_sin_evidencia(
    dataset: DatasetSuite,
) -> None:
    celdas = Counter((p.cancer, p.idioma) for p in dataset.preguntas)
    sin_evidencia = Counter(
        p.cancer for p in dataset.preguntas if p.modo_acierto == "sin_evidencia"
    )

    assert all(celdas[(tipo, idioma)] >= 10 for tipo in TIPOS for idioma in ("es", "en"))
    assert all(sin_evidencia[tipo] >= 2 for tipo in TIPOS)
    assert len({p.id for p in dataset.preguntas}) == len(dataset.preguntas)


def test_todo_control_de_apunta_a_una_pregunta_del_otro_idioma_con_la_misma_evidencia(
    dataset: DatasetSuite,
) -> None:
    por_id = {p.id: p for p in dataset.preguntas}

    controles = [p for p in dataset.preguntas if p.control_de]

    assert controles
    for control in controles:
        original = por_id[control.control_de]  # type: ignore[index]
        assert original.idioma != control.idioma
        assert original.cancer == control.cancer
        assert set(original.documentos) & set(control.documentos)


def test_el_manifiesto_del_dataset_apunta_a_los_archivos_que_existen() -> None:
    manifiesto = yaml.safe_load((DIRECTORIO / "manifest.yaml").read_text(encoding="utf-8"))

    assert all((DIRECTORIO / archivo).is_file() for archivo in manifiesto["archivos"].values())


def test_el_corpus_versionado_es_exactamente_lo_que_genera_generar_corpus_py() -> None:
    import importlib.util

    especificacion = importlib.util.spec_from_file_location(
        "generar_corpus_s5", DIRECTORIO / "generar_corpus.py"
    )
    assert especificacion is not None and especificacion.loader is not None
    modulo = importlib.util.module_from_spec(especificacion)
    especificacion.loader.exec_module(modulo)
    versionado = yaml.safe_load((DIRECTORIO / "corpus.yaml").read_text(encoding="utf-8"))

    assert modulo.construir() == versionado
