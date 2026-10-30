"""Lector doble de ``population_criteria`` contra el PostgreSQL ``corpus`` real, con el rol ``rag_corpus`` (US-241 AC-4 y AC-5).

La forma antigua (un valor por criterio) y la nueva (lista por fragmento, ADR-47) llegan al dominio como lista de valores;
una forma inválida degrada el criterio a ``desconocido`` sin romper el análisis y sin registrar el valor (RN-26, RN-14).
Se pide con ``-m servicios_reales`` dentro de ``corpus-db-net`` (``tests/support/pg.py``). Solo filas sintéticas.
"""

from __future__ import annotations

import logging
from collections.abc import Collection, Iterator
from typing import Any

import pytest
from sqlalchemy import Engine, text

from app.application.aplicabilidad import ApplicabilityService
from app.application.chunk_citable import ChunkCitable
from app.application.contexto_del_paciente import contexto_del_paciente
from app.config.settings import POBLACION_MAX_VALORES_POR_CRITERIO_INICIAL as MAX_VALORES
from app.domain.aplicabilidad_tipos import (
    CriterioDePoblacion,
    PoblacionDelEstudio,
    ResumenDeEstados,
    ValorDePoblacion,
)
from app.domain.citations import FichaDeFuente
from app.domain.relevance import ChunkPuntuado
from app.infrastructure.catalog.catalogo_reader import LectorCatalogoPostgres
from app.infrastructure.catalog.conexion import crear_motor
from app.infrastructure.catalog.corpus_document_repository import CorpusDocumentRepository
from app.schemas.generated.models import RagQueryInternalRequest
from tests.support.aplicabilidad import (
    CRITERIOS_DE_DOC_A1,
    FICHAS_FX08BA,
    criterios_de_test_apl_1_0_0,
    entorno_de_aplicabilidad,
    external_id_de,
    solicitud_a_m1,
)
from tests.support.pg import BaseDeTest
from tests.support.poblacion_lista import (
    CRITERIOS_DE_DOC_B1,
    MARCA_PENDIENTE,
    SENTINELA_DE_VALOR,
    valor_nuevo,
)
from tests.support.registros import registro_de_prueba

pytestmark = pytest.mark.servicios_reales


@pytest.fixture
def motor(base_migrada: BaseDeTest) -> Iterator[Engine]:
    motor = crear_motor(base_migrada.url_runtime)
    yield motor
    with motor.begin() as conexion:
        conexion.execute(text("DELETE FROM corpus.corpus_document"))
    motor.dispose()


def _sembrar(
    motor: Engine, documento: str, criterios: dict[str, object], origen: str, n: int
) -> None:
    CorpusDocumentRepository(motor).guardar_documento(
        registro_de_prueba(
            documento,
            population_criteria=criterios,
            metadata_source=origen,
            checksum=f"{n:064x}",
            version_group_id=documento,
        )
    )


def _lector(motor: Engine) -> LectorCatalogoPostgres:
    return LectorCatalogoPostgres(motor, MAX_VALORES)


@pytest.mark.ac("US-241", 4)
def test_lector_catalogo_formas_antigua_y_nueva_entrega_lista_de_valores(motor: Engine) -> None:
    _sembrar(motor, "doc-a1", CRITERIOS_DE_DOC_A1, "fuente_estructurada", 1)
    _sembrar(motor, "doc-b1", CRITERIOS_DE_DOC_B1, "extraido_verificado", 2)

    poblaciones = _lector(motor).poblacion_por_documento({"doc-a1", "doc-b1"})

    antigua, nueva = poblaciones["doc-a1"], poblaciones["doc-b1"]
    assert antigua.criterios.get("biomarcadores.her2") == CriterioDePoblacion(
        (ValorDePoblacion("positivo", "elegibilidad", None),)
    )
    assert antigua.criterios.get("estadio") == CriterioDePoblacion(
        (ValorDePoblacion("I–III", "elegibilidad", None),)
    )
    assert nueva.criterios.get("estado_menopausico") == CriterioDePoblacion(
        (
            ValorDePoblacion("premenopausal women", "elegibilidad", "ch-b1-1"),
            ValorDePoblacion("postmenopausal women", "elegibilidad", "ch-b1-1"),
        )
    )
    assert _resumen_de_a_m1_con(antigua) == ResumenDeEstados(
        coincide=2, parcial=0, no_coincide=0, desconocido=3
    )


def _resumen_de_a_m1_con(poblacion: PoblacionDelEstudio) -> ResumenDeEstados:
    """A-M1 × doc-a1 con ``test-apl-1.0.0``: el resumen que ``/rag/query`` devuelve para esa fuente."""
    a_m1 = contexto_del_paciente(
        RagQueryInternalRequest.model_validate(solicitud_a_m1()).clinicalContext
    )
    chunk = ChunkCitable(ChunkPuntuado("ch-a1-1", "doc-a1", "texto", 0.9), FICHAS_FX08BA["doc-a1"])
    fuentes = ApplicabilityService(criterios_de_test_apl_1_0_0()).evaluar(
        "mama", a_m1, {"doc-a1": chunk}, {"doc-a1": poblacion}
    )
    return fuentes[0].resumen


class _CatalogoConLectorReal:
    """Fichas de FX-08b-a (Milvus y fichas son otros bordes) y población leída del ``corpus`` real."""

    def __init__(self, lector: LectorCatalogoPostgres) -> None:
        self._lector = lector

    def fichas_por_documento(self, document_ids: Collection[str]) -> dict[str, FichaDeFuente]:
        return {d: FICHAS_FX08BA[d] for d in document_ids if d in FICHAS_FX08BA}

    def poblacion_por_documento(
        self, document_ids: Collection[str]
    ) -> dict[str, PoblacionDelEstudio]:
        return self._lector.poblacion_por_documento(document_ids)


@pytest.mark.ac("US-241", 5)
def test_forma_invalida_degrada_criterio_a_desconocido_y_registra_log(
    motor: Engine, caplog: pytest.LogCaptureFixture
) -> None:
    criterios = {
        **CRITERIOS_DE_DOC_A1,
        "ecog": [
            valor_nuevo(f"{SENTINELA_DE_VALOR}-{n}", "ch-a1-1") for n in range(MAX_VALORES + 1)
        ],
        "estadio": [valor_nuevo(SENTINELA_DE_VALOR, "ch-a1-1", alcance="global")],
        "linea": MARCA_PENDIENTE,
    }
    _sembrar(motor, "doc-a1", criterios, "extraido_verificado", 1)
    solicitud = solicitud_a_m1()
    entorno = entorno_de_aplicabilidad(
        {"doc-a1": 0.90},
        catalogo_falso=_CatalogoConLectorReal(_lector(motor)),  # type: ignore[arg-type]
    )
    caplog.set_level(logging.DEBUG)

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 200
    por_criterio = _criterios_de_la_fuente(respuesta.json())
    for invalido in ("ecog", "estadio"):
        assert por_criterio[invalido]["status"] == "desconocido"
        assert por_criterio[invalido]["unknownReason"] == "no_reportado_por_fuente"
    assert por_criterio["estado_her2"]["status"] == "coincide"
    mensajes = [r.getMessage() for r in caplog.records]
    registros = [m for m in mensajes if "event=poblacion_forma_invalida" in m]
    assert len(registros) == 2
    assert all(f"chunkId=ch-a1-1 traceId={solicitud['traceId']}" in m for m in registros)
    assert {"ecog", "estadio"} == {
        c for c in ("ecog", "estadio", "linea") if any(f"criterio={c} " in m for m in registros)
    }
    assert not any(SENTINELA_DE_VALOR in m for m in mensajes)


def _criterios_de_la_fuente(cuerpo: dict[str, Any]) -> dict[str, dict[str, Any]]:
    fuente = next(f for f in cuerpo["applicability"] if f["externalId"] == external_id_de("doc-a1"))
    return {c["criterion"]: c for c in fuente["criteria"]}
