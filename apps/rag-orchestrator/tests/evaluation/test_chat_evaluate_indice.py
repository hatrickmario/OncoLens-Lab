"""Fuente ``indice`` de la familia ``chat`` (L1D-326, ``[S7 resp. 10]``): el chat se mide sobre la ingesta de ``l1d-119``.

El almacén vectorial y el catálogo se fingen en su puerto (``indice_fingido``: mismos puertos que el corpus real, sin escritura);
el adapter de lectura real se prueba con el cliente de Milvus y el motor de PostgreSQL fingidos. La CI no tiene Milvus: con
adapters falsos la familia sigue corriendo sobre el dataset. Solo datos sintéticos (RN-14): el reporte lleva colección,
recuento y huella de ids, nunca texto de un chunk.
"""

import asyncio
import json
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.evaluation import chat
from app.evaluation.adaptadores_falsos import EmbedderBolsaDePalabras
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.dataset_chat import cargar_dataset_de_chat
from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.indice_del_corpus import (
    IndiceDelCorpus,
    ResumenDelIndice,
    abrir_indice_real,
    huella_de_chunks,
    indice_fingido,
)
from app.evaluation.rutas import raiz_repo

CONFIG = raiz_repo() / "apps/rag-orchestrator/eval/configs/chat-fake.yaml"
CONFIG_LOCAL = raiz_repo() / "apps/rag-orchestrator/eval/configs/chat-local.yaml"
CHAT_V1 = raiz_repo() / "data" / "eval" / "chat-v1"
UMBRALES_DEL_ENTORNO = {
    "RELEVANCE_THRESHOLD": "0.30",
    "NLI_ENTAILMENT_THRESHOLD": "0.7",
    "RETRIEVAL_TOP_K": "30",
    "RERANK_TOP_N": "10",
}
URI_SECRETA = "http://milvus-secreto.invalid:19530"
HOST_SECRETO = "postgres-secreto.invalid"


def _corpus():
    return FuenteDatasetEnDirectorio(raiz_repo() / "data/evaluation/opciones").cargar()


def _indice_con_el_corpus_del_dataset() -> IndiceDelCorpus:
    corpus = _corpus()
    embedder = EmbedderBolsaDePalabras()
    return indice_fingido(corpus, [embedder.embeber(c.texto) for c in corpus.chunks])


def _evaluar(puertos: chat.PuertosDeChat | None = None, config_ruta: Path = CONFIG):
    config = cargar_config_suite(config_ruta, UMBRALES_DEL_ENTORNO)
    dataset = cargar_dataset_de_chat(CHAT_V1)
    peticiones = chat.peticiones_de_ejemplo(dataset, config)
    return asyncio.run(chat.evaluar(config, dataset, peticiones, puertos=puertos))


@pytest.mark.ac("US-269", 3)
def test_evaluar_chat_declara_la_coleccion_el_recuento_y_la_huella_del_indice_leido_sin_texto_cuando_usa_la_fuente_indice():  # noqa: E501
    indice = _indice_con_el_corpus_del_dataset()

    reporte = _evaluar(chat.PuertosDeChat(indice=indice))

    cargado = reporte["corpus"]["cargado"]
    assert cargado == {
        "fuente": "indice",
        "coleccion": indice.resumen.coleccion,
        "chunks_vigentes": len(_corpus().chunks),
        "huella": huella_de_chunks(c.id for c in _corpus().chunks),
    }
    texto = json.dumps(reporte, ensure_ascii=False)
    assert all(c.texto not in texto for c in _corpus().chunks)


@pytest.mark.ac("US-269", 3)
def test_evaluar_chat_mide_lo_mismo_con_la_fuente_indice_que_con_el_corpus_en_memoria_cuando_el_indice_tiene_los_mismos_chunks():  # noqa: E501
    en_memoria = _evaluar()

    con_indice = _evaluar(chat.PuertosDeChat(indice=_indice_con_el_corpus_del_dataset()))

    assert con_indice["metricas"]["por_tipo"] == en_memoria["metricas"]["por_tipo"]
    assert con_indice["metricas"]["exactitud_de_intent"] == 1.0
    assert en_memoria["corpus"]["cargado"] == {
        "fuente": "dataset",
        "ruta": "data/evaluation/opciones",
    }


def test_evaluar_chat_aborta_nombrando_la_causa_cuando_el_indice_esta_vacio():
    vacio = IndiceDelCorpus(
        _indice_con_el_corpus_del_dataset().puertos,
        ResumenDelIndice("corpus_chunks", 0, huella_de_chunks([])),
    )

    with pytest.raises(SuiteAbortada, match="vac"):
        _evaluar(chat.PuertosDeChat(indice=vacio))


def _config_con_indice(tmp_path: Path, proveedor: str = "local") -> Path:
    crudo = yaml.safe_load(CONFIG_LOCAL.read_text(encoding="utf-8"))
    crudo["adaptadores"]["proveedor"] = proveedor
    ruta = tmp_path / "chat-indice.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


def test_chat_local_usa_la_fuente_indice_cuando_se_carga_la_config():
    config = cargar_config_suite(CONFIG_LOCAL, UMBRALES_DEL_ENTORNO)

    assert config.indice_fuente == "milvus"


def test_cargar_config_suite_rechaza_la_fuente_indice_cuando_los_adapters_son_falsos(
    tmp_path: Path,
):
    with pytest.raises(ConfigInvalida, match="indice"):
        cargar_config_suite(_config_con_indice(tmp_path, "fake"), UMBRALES_DEL_ENTORNO)


def test_evaluar_chat_aborta_cuando_la_config_pide_la_fuente_indice_y_no_se_abrio_ningun_indice(
    tmp_path: Path,
):
    config = cargar_config_suite(_config_con_indice(tmp_path), UMBRALES_DEL_ENTORNO)
    dataset = cargar_dataset_de_chat(CHAT_V1)

    with pytest.raises(SuiteAbortada, match="indice"):
        asyncio.run(chat.evaluar(config, dataset, chat.peticiones_de_ejemplo(dataset, config)))


# --- adapter de lectura real, con el cliente de Milvus y el motor de PostgreSQL fingidos -----------------------------


class IteradorFalso:
    def __init__(self, filas: list[dict[str, Any]]) -> None:
        self._paginas = [filas[i : i + 2] for i in range(0, len(filas), 2)]

    def next(self) -> list[dict[str, Any]]:
        return self._paginas.pop(0) if self._paginas else []

    def close(self) -> None:
        pass


class ClienteMilvusFalso:
    """Registra cada operación: la fuente ``indice`` solo puede consultar (RN-05: la ingesta no se toca)."""

    def __init__(self, *, existe: bool = True, filas: list[dict[str, Any]] | None = None) -> None:
        self.existe = existe
        self.filas = filas or []
        self.llamadas: list[str] = []

    def has_collection(self, nombre: str, **_: Any) -> bool:
        self.llamadas.append("has_collection")
        return self.existe

    def load_collection(self, nombre: str, **_: Any) -> None:
        self.llamadas.append("load_collection")

    def query_iterator(self, nombre: str, **_: Any) -> IteradorFalso:
        self.llamadas.append("query_iterator")
        return IteradorFalso(self.filas)


class MotorFalso:
    @contextmanager
    def connect(self):
        yield self

    def execute(self, consulta: object) -> None:
        pass

    def dispose(self) -> None:
        pass


@pytest.fixture
def entorno_del_corpus(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    secreto = tmp_path / "pg_rag_corpus_password"
    secreto.write_text("contrasena-secreta\n")
    for clave, valor in {
        "MILVUS_URI": URI_SECRETA,
        "MILVUS_COLLECTION_NAME": "coleccion_de_119",
        "EMBEDDING_DIM": "8",
        "VECTOR_INDEX_TYPE": "HNSW",
        "VECTOR_INDEX_PARAMS": '{"M": 16, "efConstruction": 200, "ef": 64}',
        "MILVUS_DENSE_METRIC_TYPE": "COSINE",
        "CORPUS_DATABASE_URL": f"postgresql+psycopg://rag_corpus@{HOST_SECRETO}:5432/oncolens?sslmode=require",
        "PG_RAG_CORPUS_PASSWORD_FILE": str(secreto),
    }.items():
        monkeypatch.setenv(clave, valor)


def _fila(chunk_id: str) -> dict[str, Any]:
    return {"chunk_id": chunk_id, "chunk_text": f"texto sintetico de {chunk_id}"}


def test_abrir_indice_real_resume_la_coleccion_sin_texto_y_solo_consulta_cuando_la_ingesta_existe(
    entorno_del_corpus: None,
):
    cliente = ClienteMilvusFalso(filas=[_fila("c2"), _fila("c1"), _fila("c3")])

    indice = abrir_indice_real(
        fabricar_cliente=lambda **_: cliente, fabricar_motor=lambda _: MotorFalso()
    )

    assert indice.resumen == ResumenDelIndice(
        "coleccion_de_119", 3, huella_de_chunks(["c1", "c2", "c3"])
    )
    assert "texto sintetico" not in repr(indice.resumen)
    assert set(cliente.llamadas) == {"has_collection", "load_collection", "query_iterator"}


def test_abrir_indice_real_aborta_nombrando_la_variable_y_sin_direccion_cuando_la_coleccion_no_existe(
    entorno_del_corpus: None,
):
    cliente = ClienteMilvusFalso(existe=False)

    with pytest.raises(SuiteAbortada, match="MILVUS_COLLECTION_NAME") as error:
        abrir_indice_real(
            fabricar_cliente=lambda **_: cliente, fabricar_motor=lambda _: MotorFalso()
        )

    assert URI_SECRETA not in str(error.value) and HOST_SECRETO not in str(error.value)
    assert "query_iterator" not in cliente.llamadas


def test_abrir_indice_real_aborta_nombrando_las_variables_cuando_falta_la_configuracion_del_corpus(
    monkeypatch: pytest.MonkeyPatch,
):
    for variable in ("MILVUS_URI", "CORPUS_DATABASE_URL"):
        monkeypatch.delenv(variable, raising=False)

    with pytest.raises(SuiteAbortada, match="MILVUS_URI"):
        abrir_indice_real()


def test_huella_de_chunks_no_depende_del_orden_y_cambia_con_los_ids():
    assert huella_de_chunks(["b", "a"]) == huella_de_chunks(["a", "b"])
    assert huella_de_chunks(["a", "b"]) != huella_de_chunks(["a", "c"])
