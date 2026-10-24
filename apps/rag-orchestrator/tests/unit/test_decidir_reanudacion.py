"""Regla pura ``decidir_reanudacion`` (US-117a D2): qué hay en el catálogo del contenido que la ingesta va a procesar."""

from __future__ import annotations

import pytest

from app.domain.corpus_seed.versionado import (
    Reanudacion,
    VersionExistente,
    decidir_reanudacion,
)

CHECKSUM = "ab" * 32


def _version(
    status: str, checksum: str = CHECKSUM, document_id: str = "d@abababababab"
) -> VersionExistente:
    return VersionExistente(document_id, checksum, False, status)


def test_es_nuevo_cuando_el_grupo_no_tiene_versiones() -> None:
    decision = decidir_reanudacion(CHECKSUM, [])

    assert decision.estado is Reanudacion.NUEVO and decision.document_id is None


@pytest.mark.parametrize("status", ["pendiente", "normalizado", "error"])
def test_reanuda_con_el_mismo_document_id_cuando_hay_una_fila_a_medias_del_mismo_contenido(
    status: str,
) -> None:
    decision = decidir_reanudacion(CHECKSUM, [_version(status, document_id="d@fila-a-medias")])

    assert decision.estado is Reanudacion.REANUDAR and decision.document_id == "d@fila-a-medias"


def test_ya_esta_embebido_cuando_el_mismo_contenido_esta_embebido() -> None:
    decision = decidir_reanudacion(CHECKSUM, [_version("embebido", document_id="d@embebido")])

    assert decision.estado is Reanudacion.YA_EMBEBIDO and decision.document_id == "d@embebido"


def test_es_nuevo_cuando_la_fila_a_medias_es_de_otro_contenido() -> None:
    decision = decidir_reanudacion(CHECKSUM, [_version("normalizado", checksum="cd" * 32)])

    assert decision.estado is Reanudacion.NUEVO


def test_es_nuevo_cuando_la_fila_en_error_no_llego_a_calcular_el_checksum() -> None:
    decision = decidir_reanudacion(CHECKSUM, [_version("error", checksum="")])

    assert decision.estado is Reanudacion.NUEVO


def test_es_nuevo_cuando_el_mismo_contenido_fue_rechazado_por_licencia() -> None:
    decision = decidir_reanudacion(CHECKSUM, [_version("rechazado_licencia")])

    assert decision.estado is Reanudacion.NUEVO


def test_prefiere_la_fila_embebida_sobre_una_a_medias_del_mismo_contenido() -> None:
    decision = decidir_reanudacion(
        CHECKSUM,
        [_version("error", document_id="d@a-medias"), _version("embebido", document_id="d@listo")],
    )

    assert decision.estado is Reanudacion.YA_EMBEBIDO and decision.document_id == "d@listo"
