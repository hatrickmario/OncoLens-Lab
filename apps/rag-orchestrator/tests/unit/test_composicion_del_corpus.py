"""Composición de los bordes reales del corpus (US-231b AC-9, RN-12, RN-22): sonda de arranque y errores sin dirección.

Solo se fingen los bordes (cliente de Milvus y motor de PostgreSQL); la composición, el rol ``rag_corpus`` y la traducción
de errores son los reales. Ningún mensaje lleva URI, host, puerto, DSN ni el motivo del cliente.
"""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.engine import URL

from app.config.settings import CorpusDatabaseSettings, MilvusSettings
from app.infrastructure.catalog.catalogo_reader import LectorCatalogoPostgres
from app.infrastructure.catalog.release_reader import LectorReleasePostgres
from app.infrastructure.corpus.composicion import (
    CorpusNoDisponibleError,
    crear_puertos_del_corpus,
    puertos_del_corpus_segun_proveedores,
)
from app.infrastructure.milvus.repository import MilvusRepository
from tests.support.fakes import settings_de_prueba

URI_SECRETA = "http://milvus-secreto.invalid:19530"
HOST_SECRETO = "postgres-secreto.invalid"
URL_DEL_CATALOGO = f"postgresql+psycopg://rag_corpus@{HOST_SECRETO}:5432/oncolens?sslmode=require"


class ClienteMilvusFalso:
    def __init__(
        self, *, existe: bool = True, error: Exception | None = None, **kwargs: Any
    ) -> None:
        self.argumentos = kwargs
        self.existe = existe
        self.error = error
        self.consultadas: list[str] = []
        self.cargadas: list[str] = []

    def has_collection(self, nombre: str, **_: Any) -> bool:
        self.consultadas.append(nombre)
        if self.error is not None:
            raise self.error
        return self.existe

    def load_collection(self, nombre: str, **_: Any) -> None:
        self.cargadas.append(nombre)


class MotorFalso:
    def __init__(self, url: URL, error: Exception | None = None) -> None:
        self.url = url
        self.error = error
        self.consultas: list[str] = []
        self.liberado = False

    @contextmanager
    def connect(self):
        if self.error is not None:
            raise self.error
        yield self

    def execute(self, consulta: object) -> None:
        self.consultas.append(str(consulta))

    def dispose(self) -> None:
        self.liberado = True


@pytest.fixture
def ajustes(tmp_path: Path) -> tuple[MilvusSettings, CorpusDatabaseSettings]:
    secreto = tmp_path / "pg_rag_corpus_password"
    secreto.write_text("contrasena-secreta\n")
    milvus = MilvusSettings(  # type: ignore[call-arg]
        _env_file=None,
        milvus_uri=URI_SECRETA,
        embedding_dim=8,
        vector_index_type="HNSW",
        vector_index_params={"M": 16, "efConstruction": 200, "ef": 64},
        milvus_dense_metric_type="COSINE",
    )
    base = CorpusDatabaseSettings(  # type: ignore[call-arg]
        _env_file=None, corpus_database_url=URL_DEL_CATALOGO, pg_rag_corpus_password_file=secreto
    )
    return milvus, base


def _componer(
    ajustes: tuple[MilvusSettings, CorpusDatabaseSettings],
    *,
    error_de_catalogo: Exception | None = None,
    cliente: ClienteMilvusFalso | None = None,
    error_al_crear_cliente: Exception | None = None,
):
    motores: list[MotorFalso] = []
    clientes: list[ClienteMilvusFalso] = []

    def fabricar_motor(url: URL) -> MotorFalso:
        motores.append(MotorFalso(url, error_de_catalogo))
        return motores[-1]

    def fabricar_cliente(**kwargs: Any) -> ClienteMilvusFalso:
        if error_al_crear_cliente is not None:
            raise error_al_crear_cliente
        clientes.append(cliente or ClienteMilvusFalso(**kwargs))
        clientes[-1].argumentos = kwargs
        return clientes[-1]

    milvus, base = ajustes
    puertos = crear_puertos_del_corpus(
        milvus, base, fabricar_cliente=fabricar_cliente, fabricar_motor=fabricar_motor
    )
    return puertos, motores, clientes


@pytest.mark.ac("US-231b", 9)
def test_devuelve_los_puertos_reales_del_corpus_cuando_milvus_y_el_catalogo_responden(
    ajustes: tuple[MilvusSettings, CorpusDatabaseSettings],
) -> None:
    puertos, motores, clientes = _componer(ajustes)

    assert isinstance(puertos.buscador, MilvusRepository)
    assert isinstance(puertos.lector_release, LectorReleasePostgres)
    assert isinstance(puertos.catalogo, LectorCatalogoPostgres)
    assert motores[0].consultas == ["SELECT 1"]
    assert clientes[0].consultadas == ["corpus_chunks"] and clientes[0].cargadas == [
        "corpus_chunks"
    ]


def test_el_catalogo_se_conecta_con_el_rol_rag_corpus_la_contrasena_del_archivo_y_tls_obligatorio(
    ajustes: tuple[MilvusSettings, CorpusDatabaseSettings],
) -> None:
    _, motores, _ = _componer(ajustes)

    url = motores[0].url
    assert url.username == "rag_corpus" and url.password == "contrasena-secreta"
    assert url.query["sslmode"] == "require" and url.drivername == "postgresql+psycopg"


def test_el_cliente_de_milvus_recibe_la_uri_y_el_plazo_de_la_configuracion(
    ajustes: tuple[MilvusSettings, CorpusDatabaseSettings],
) -> None:
    _, _, clientes = _componer(ajustes)

    assert clientes[0].argumentos == {
        "uri": URI_SECRETA,
        "timeout": ajustes[0].milvus_connect_timeout_seconds,
    }


@pytest.mark.ac("US-231b", 9)
def test_un_catalogo_inaccesible_termina_nombrando_corpus_database_url_sin_host_ni_motivo(
    ajustes: tuple[MilvusSettings, CorpusDatabaseSettings],
) -> None:
    fallo = ConnectionError(f"no conecta a {HOST_SECRETO}:5432 con la contrasena-secreta")

    with pytest.raises(CorpusNoDisponibleError) as error:
        _componer(ajustes, error_de_catalogo=fallo)

    assert error.value.variable == "CORPUS_DATABASE_URL"
    texto = f"{error.value} {error.value!r} {error.value.__cause__}"
    assert HOST_SECRETO not in texto and "contrasena-secreta" not in texto
    assert error.value.__cause__ is None and error.value.__suppress_context__


def test_un_catalogo_inaccesible_libera_el_motor_antes_de_terminar(
    ajustes: tuple[MilvusSettings, CorpusDatabaseSettings],
) -> None:
    motores: list[MotorFalso] = []

    def fabricar_motor(url: URL) -> MotorFalso:
        motores.append(MotorFalso(url, ConnectionError("x")))
        return motores[-1]

    with pytest.raises(CorpusNoDisponibleError):
        crear_puertos_del_corpus(
            *ajustes, fabricar_cliente=ClienteMilvusFalso, fabricar_motor=fabricar_motor
        )

    assert motores[0].liberado is True


@pytest.mark.ac("US-231b", 9)
def test_un_milvus_inaccesible_termina_nombrando_milvus_uri_sin_la_uri_ni_el_motivo(
    ajustes: tuple[MilvusSettings, CorpusDatabaseSettings],
) -> None:
    cliente = ClienteMilvusFalso(error=RuntimeError(f"sin conexión con {URI_SECRETA}"))

    with pytest.raises(CorpusNoDisponibleError) as error:
        _componer(ajustes, cliente=cliente)

    assert error.value.variable == "MILVUS_URI"
    assert URI_SECRETA not in f"{error.value} {error.value!r} {error.value.__cause__}"
    assert error.value.__cause__ is None and error.value.__suppress_context__


def test_un_cliente_de_milvus_que_no_se_puede_crear_termina_nombrando_milvus_uri(
    ajustes: tuple[MilvusSettings, CorpusDatabaseSettings],
) -> None:
    with pytest.raises(CorpusNoDisponibleError) as error:
        _componer(ajustes, error_al_crear_cliente=RuntimeError(URI_SECRETA))

    assert error.value.variable == "MILVUS_URI" and URI_SECRETA not in str(error.value)


def test_una_coleccion_ausente_termina_nombrando_la_variable_del_nombre_de_coleccion(
    ajustes: tuple[MilvusSettings, CorpusDatabaseSettings],
) -> None:
    with pytest.raises(CorpusNoDisponibleError) as error:
        _componer(ajustes, cliente=ClienteMilvusFalso(existe=False))

    assert error.value.variable == "MILVUS_COLLECTION_NAME"


def test_un_archivo_de_contrasena_ilegible_termina_nombrando_su_variable_sin_crear_el_motor(
    ajustes: tuple[MilvusSettings, CorpusDatabaseSettings], tmp_path: Path
) -> None:
    milvus, base = ajustes
    base = CorpusDatabaseSettings(  # type: ignore[call-arg]
        _env_file=None,
        corpus_database_url=URL_DEL_CATALOGO,
        pg_rag_corpus_password_file=tmp_path / "no-existe",
    )
    motores: list[MotorFalso] = []

    with pytest.raises(CorpusNoDisponibleError) as error:
        crear_puertos_del_corpus(
            milvus,
            base,
            fabricar_cliente=ClienteMilvusFalso,
            fabricar_motor=lambda url: motores.append(MotorFalso(url)),  # type: ignore[func-returns-value]
        )

    assert error.value.variable == "PG_RAG_CORPUS_PASSWORD_FILE" and motores == []
    assert str(tmp_path) not in f"{error.value} {error.value!r}"


@pytest.mark.parametrize(
    ("modelos", "llm"), [("fake", "local"), ("local", "fake"), ("fake", "fake")]
)
def test_sin_modelos_y_llm_locales_no_se_compone_el_corpus(modelos: str, llm: str) -> None:
    ajustes = settings_de_prueba(model_provider=modelos, llm_provider=llm)

    assert puertos_del_corpus_segun_proveedores(ajustes) is None


def test_con_modelos_y_llm_locales_una_clave_ausente_termina_nombrandola(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for clave in ("MILVUS_URI", "CORPUS_DATABASE_URL", "PG_RAG_CORPUS_PASSWORD_FILE"):
        monkeypatch.delenv(clave, raising=False)

    with pytest.raises(CorpusNoDisponibleError) as error:
        puertos_del_corpus_segun_proveedores(
            settings_de_prueba(model_provider="local", llm_provider="local")
        )

    assert error.value.variable in {"MILVUS_URI", "CORPUS_DATABASE_URL"}
    assert error.value.__suppress_context__
