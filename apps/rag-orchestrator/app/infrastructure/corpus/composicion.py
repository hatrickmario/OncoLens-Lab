"""Composición de los bordes reales del corpus (Milvus y schema ``corpus``) para ``app/main.py`` (US-231b AC-9).

Solo con ``MODEL_PROVIDER=local`` y ``LLM_PROVIDER=local``. La composición usa las credenciales de ``rag-orchestrator``
y ninguna otra: el rol ``rag_corpus`` (URL sin contraseña, contraseña desde su archivo de secreto, ``sslmode=require``)
y Milvus. Al arrancar sonda ambos (``SELECT 1`` y ``has_collection``): si alguno no responde el proceso termina nombrando
la variable de configuración, sin URI, host, puerto, DSN ni el motivo del cliente, y nunca recurre a un corpus falso
(fail-closed, RN-12/RN-22).

``pymilvus`` y SQLAlchemy se importan al componer, no al importar el módulo: con proveedores ``fake`` no se cargan.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pydantic import ValidationError

from app.application.ports import PuertosDelCorpus
from app.config.settings import CorpusDatabaseSettings, MilvusSettings, Settings


class CorpusNoDisponibleError(RuntimeError):
    """El corpus no se puede componer o no responde. El mensaje es solo el NOMBRE de la variable de configuración:
    nunca la URI, el host, el puerto, el DSN ni el motivo del cliente."""

    def __init__(self, variable: str) -> None:
        super().__init__(variable)
        self.variable = variable


def puertos_del_corpus_segun_proveedores(settings: Settings) -> PuertosDelCorpus | None:
    """Los bordes reales del corpus si modelos y LLM son locales; si no, ``None`` (no se importa Milvus)."""
    if settings.model_provider != "local" or settings.llm_provider != "local":
        return None
    milvus, base = _leer_configuracion_del_corpus()
    return crear_puertos_del_corpus(milvus, base)


def crear_puertos_del_corpus(
    milvus: MilvusSettings,
    base: CorpusDatabaseSettings,
    *,
    fabricar_cliente: Callable[..., Any] | None = None,
    fabricar_motor: Callable[..., Any] | None = None,
) -> PuertosDelCorpus:
    """Construye Milvus y los lectores del catálogo y los sonda. Las fábricas se inyectan en los tests."""
    from app.infrastructure.catalog.catalogo_reader import LectorCatalogoPostgres
    from app.infrastructure.catalog.release_reader import LectorReleasePostgres
    from app.infrastructure.milvus.repository import MilvusRepository

    motor = _abrir_y_sondar_el_catalogo(base, fabricar_motor)
    try:
        cliente = _abrir_y_sondar_milvus(milvus, fabricar_cliente)
    except BaseException:
        motor.dispose()
        raise
    return PuertosDelCorpus(
        buscador=MilvusRepository(cliente, milvus),
        lector_release=LectorReleasePostgres(motor),
        catalogo=LectorCatalogoPostgres(motor),
    )


def _leer_configuracion_del_corpus() -> tuple[MilvusSettings, CorpusDatabaseSettings]:
    claves: set[str] = set()
    ajustes: list[Any] = []
    for clase in (MilvusSettings, CorpusDatabaseSettings):
        try:
            ajustes.append(clase(_env_file=None))  # type: ignore[call-arg]
        except ValidationError as error:
            claves |= {str(e["loc"][0]).upper() for e in error.errors() if e["loc"]}
    if claves:
        raise CorpusNoDisponibleError(", ".join(sorted(claves))) from None
    return ajustes[0], ajustes[1]


def _abrir_y_sondar_el_catalogo(
    base: CorpusDatabaseSettings, fabricar_motor: Callable[..., Any] | None
) -> Any:
    """Motor del rol ``rag_corpus`` y ``SELECT 1``: ``create_engine`` no conecta al construirse, así que se sonda."""
    from sqlalchemy import text

    from app.infrastructure.catalog.conexion import SecretoIlegible, componer_url, crear_motor

    try:
        url = componer_url(
            base.corpus_database_url,
            base.pg_rag_corpus_password_file,
            "PG_RAG_CORPUS_PASSWORD_FILE",
        ).update_query_dict({"connect_timeout": str(base.corpus_connect_timeout_seconds)})
    except SecretoIlegible:
        raise CorpusNoDisponibleError("PG_RAG_CORPUS_PASSWORD_FILE") from None
    try:
        motor = (fabricar_motor or crear_motor)(url)
    except Exception:  # noqa: BLE001 - el mensaje del motor puede llevar el DSN
        raise CorpusNoDisponibleError("CORPUS_DATABASE_URL") from None
    try:
        with motor.connect() as conexion:
            conexion.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 - el mensaje del driver lleva el host y el puerto
        motor.dispose()
        raise CorpusNoDisponibleError("CORPUS_DATABASE_URL") from None
    return motor


def _abrir_y_sondar_milvus(
    milvus: MilvusSettings, fabricar_cliente: Callable[..., Any] | None
) -> Any:
    """Cliente de Milvus con plazo, ``has_collection`` y carga de la colección (idempotente, no es DDL)."""
    if fabricar_cliente is None:
        from pymilvus import MilvusClient

        fabricar_cliente = MilvusClient
    try:
        cliente = fabricar_cliente(
            uri=milvus.milvus_uri, timeout=milvus.milvus_connect_timeout_seconds
        )
        existe = cliente.has_collection(milvus.milvus_collection_name)
        if existe:
            cliente.load_collection(milvus.milvus_collection_name)
    except Exception:  # noqa: BLE001 - el mensaje de pymilvus lleva la URI
        raise CorpusNoDisponibleError("MILVUS_URI") from None
    if not existe:
        raise CorpusNoDisponibleError("MILVUS_COLLECTION_NAME")
    return cliente
