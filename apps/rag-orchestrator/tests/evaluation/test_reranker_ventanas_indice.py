"""Fuente ``indice`` en la comparación de brazos del reranker (US-278 AC-4, ``[S7 resp. 10]``, ``[S7 resp. 14]``).

Los brazos leen la ingesta en solo lectura detrás del puerto ``ChunkSearch`` (el almacén vectorial fingido en su puerto) y cada
brazo puede leer su propia colección (la de chunks de 512 tokens). Sin Milvus ni modelos reales.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from app.evaluation.adaptadores_falsos import EmbedderBolsaDePalabras, indice_fingido
from app.evaluation.armado_comparacion import armar_comparacion
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.corrida_brazos import evaluar_brazos
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.evaluate import corpus_de_la_comparacion
from app.evaluation.fuente_dataset import DatasetSuite, FuenteDatasetEnDirectorio
from app.evaluation.indice_del_corpus import (
    IndiceDelCorpus,
    ResumenDelIndice,
    abrir_indice_real,
    huella_de_chunks,
)
from app.evaluation.medidores import clave_del_documento
from app.evaluation.parafrasis_de_la_comparacion import con_parafrasis
from tests.evaluation.conftest import RAIZ_APP
from tests.evaluation.test_chat_evaluate_indice import (
    ClienteMilvusFalso,
    MotorFalso,
    _aplicar_entorno_del_corpus,
    _fila,
)
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "s7-reranker-ventanas-fake.yaml"
ENTORNO = {"STACK_MEMORY_LIMIT_GB": "30"}
COLECCION_512 = "corpus_chunks_512"


def _mundo() -> tuple[Any, DatasetSuite, dict[str, tuple[str, ...]]]:
    config = cargar_config_suite(CONFIG, ENTORNO)
    base = FuenteDatasetEnDirectorio(config.dataset).cargar()
    dataset, pares = con_parafrasis(base, config.comparacion.parafrasis)  # type: ignore[arg-type]
    return config, dataset, pares


def _indice(dataset: DatasetSuite, coleccion: str | None = None) -> IndiceDelCorpus:
    embedder = EmbedderBolsaDePalabras()
    fingido = indice_fingido(dataset, [embedder.embeber(c.texto) for c in dataset.chunks])
    if coleccion is None:
        return fingido
    resumen = ResumenDelIndice(coleccion, fingido.resumen.chunks_vigentes, fingido.resumen.huella)
    return IndiceDelCorpus(fingido.puertos, resumen)


def _evaluar(config: Any, dataset: DatasetSuite, abrir: Any = None):
    return asyncio.run(
        evaluar_brazos(
            config,
            config.comparacion,
            dataset,
            RelojFijo(),
            lambda: Cronometro(RelojSimulado()),
            None,
            abrir,
        )
    )


@pytest.mark.ac("US-278", 4)
def test_el_informe_identifica_el_corpus_de_la_corrida_sin_texto_cuando_los_brazos_leen_el_indice() -> (
    None
):
    config, dataset, pares = _mundo()
    indice = _indice(dataset)

    brazos = _evaluar(config, dataset, lambda coleccion: indice)
    corpus = corpus_de_la_comparacion(config, dataset, brazos, {"CORPUS_CHUNK_SIZE": "1024"})

    assert corpus == {
        "fuente": "indice",
        "declarado": None,
        "coleccion": indice.resumen.coleccion,
        "chunks_vigentes": len(dataset.chunks),
        "huella": huella_de_chunks(c.id for c in dataset.chunks),
        "chunk_size_de_la_ingesta": 1024,
        "indices_distintos": [],
    }
    seccion = armar_comparacion(
        config, config.comparacion, brazos, pares_de_parafrasis=pares, corpus=corpus
    ).seccion
    assert all(c.texto not in json.dumps(seccion, ensure_ascii=False) for c in dataset.chunks[:20])


def test_el_informe_declara_que_corrio_sobre_el_corpus_del_dataset_cuando_no_hay_indice() -> None:
    config, dataset, _ = _mundo()

    brazos = _evaluar(config, dataset)
    corpus = corpus_de_la_comparacion(config, dataset, brazos, {})

    assert (corpus["fuente"], corpus["coleccion"], corpus["huella"]) == ("dataset", None, None)
    assert corpus["chunk_size_de_la_ingesta"] is None and corpus["chunks_vigentes"] == len(
        dataset.chunks
    )


def test_los_brazos_miden_lo_mismo_con_el_indice_fingido_que_con_el_corpus_en_memoria_cuando_tienen_los_mismos_chunks() -> (
    None
):
    config, dataset, _ = _mundo()

    en_memoria = _evaluar(config, dataset)
    con_indice = _evaluar(config, dataset, lambda coleccion: _indice(dataset))

    for a, b in zip(en_memoria, con_indice, strict=True):
        assert [r.recuperacion for r in a.resultados] == [r.recuperacion for r in b.resultados]


@pytest.mark.ac("US-278", 4)
def test_un_brazo_lee_su_propia_coleccion_y_cada_coleccion_se_abre_una_sola_vez_cuando_declara_su_indice() -> (
    None
):
    config, dataset, _ = _mundo()
    a0, maximo, ampliada = config.comparacion.brazos  # type: ignore[union-attr]
    comparacion = replace(
        config.comparacion,
        brazos=(a0, replace(maximo, indice=COLECCION_512), replace(ampliada, indice=COLECCION_512)),
    )
    abiertas: list[str | None] = []

    def abrir(coleccion: str | None) -> IndiceDelCorpus:
        abiertas.append(coleccion)
        return _indice(dataset, coleccion or "corpus_chunks")

    brazos = asyncio.run(
        evaluar_brazos(
            config,
            comparacion,
            dataset,
            RelojFijo(),
            lambda: Cronometro(RelojSimulado()),
            None,
            abrir,
        )
    )
    corpus = corpus_de_la_comparacion(config, dataset, brazos, {})

    assert abiertas == [None, COLECCION_512]
    assert [b.indice.resumen.coleccion for b in brazos] == [
        "corpus_chunks",
        COLECCION_512,
        COLECCION_512,
    ]  # type: ignore[union-attr]
    assert corpus["indices_distintos"] == [maximo.nombre, ampliada.nombre]
    assert corpus["coleccion"] == "corpus_chunks"


def test_los_chunks_del_indice_con_document_id_de_la_ingesta_cuentan_como_acierto_de_su_document_key() -> (
    None
):
    assert (
        clave_del_documento("pmc-mama-pembrolizumab-er-eca@0123456789ab")
        == "pmc-mama-pembrolizumab-er-eca"
    )
    assert clave_del_documento("doc-sin-huella") == "doc-sin-huella"


class _ClienteQueNombraLaColeccion(ClienteMilvusFalso):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.colecciones: list[str] = []

    def has_collection(self, nombre: str, **_: Any) -> bool:
        self.colecciones.append(nombre)
        return super().has_collection(nombre)


@pytest.mark.ac("US-278", 4)
def test_abrir_el_indice_de_otra_coleccion_la_nombra_en_el_resumen_y_solo_consulta_sin_tocar_la_de_origen(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _aplicar_entorno_del_corpus(tmp_path, monkeypatch)
    cliente = _ClienteQueNombraLaColeccion(filas=[_fila("c1"), _fila("c2")])

    indice = abrir_indice_real(
        max_valores_de_poblacion=3,
        fabricar_cliente=lambda **_: cliente,
        fabricar_motor=lambda _: MotorFalso(),
        coleccion=COLECCION_512,
    )

    assert indice.resumen.coleccion == COLECCION_512
    assert set(cliente.colecciones) == {
        COLECCION_512
    }  # la colección de l1d-119 ("coleccion_de_119") no se toca
    assert set(cliente.llamadas) == {"has_collection", "load_collection", "query_iterator"}
