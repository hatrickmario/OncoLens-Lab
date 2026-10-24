"""Regla pura ``es_reanudacion`` (US-117a D2): si hay una fila a medias del contenido que la ingesta va a procesar."""

from __future__ import annotations

import pytest

from app.domain.corpus_seed.versionado import VersionExistente, es_reanudacion

CHECKSUM = "ab" * 32


def _version(
    status: str, checksum: str = CHECKSUM, document_id: str = "d@abababababab"
) -> VersionExistente:
    return VersionExistente(document_id, checksum, False, status)


def test_no_es_reanudacion_cuando_el_grupo_no_tiene_versiones() -> None:
    assert not es_reanudacion(CHECKSUM, [])


@pytest.mark.parametrize("status", ["pendiente", "normalizado", "error"])
def test_es_reanudacion_cuando_hay_una_fila_a_medias_del_mismo_contenido(status: str) -> None:
    assert es_reanudacion(CHECKSUM, [_version(status)])


def test_no_es_reanudacion_cuando_el_mismo_contenido_ya_esta_embebido() -> None:
    assert not es_reanudacion(CHECKSUM, [_version("embebido")])


def test_no_es_reanudacion_cuando_la_fila_a_medias_es_de_otro_contenido() -> None:
    assert not es_reanudacion(CHECKSUM, [_version("normalizado", checksum="cd" * 32)])


def test_no_es_reanudacion_cuando_la_fila_en_error_no_llego_a_calcular_el_checksum() -> None:
    assert not es_reanudacion(CHECKSUM, [_version("error", checksum="")])


def test_no_es_reanudacion_cuando_el_mismo_contenido_fue_rechazado_por_licencia() -> None:
    assert not es_reanudacion(CHECKSUM, [_version("rechazado_licencia")])


def test_prefiere_la_fila_embebida_sobre_una_a_medias_del_mismo_contenido() -> None:
    assert not es_reanudacion(
        CHECKSUM, [_version("error", document_id="d@a-medias"), _version("embebido")]
    )
