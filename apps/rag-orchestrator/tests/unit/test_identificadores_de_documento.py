"""Ida y vuelta de los identificadores de documento de la ingesta: ``clave_del_documento`` deshace lo que ``identificador_de_*`` hace."""

from __future__ import annotations

import pytest

from app.application.seed_corpus.registros import (
    clave_del_documento,
    identificador_de_documento,
    identificador_de_error,
    identificador_de_rechazado,
)

CHECKSUM = "0123456789abcdef" * 4


@pytest.mark.parametrize(
    "clave", ["pmc-mama-pembrolizumab-er-eca", "doc", "doc@con-arroba", "a.b_c:d+e/f"]
)
def test_la_clave_del_documento_se_recupera_del_identificador_de_la_ingesta(clave: str) -> None:
    assert clave_del_documento(identificador_de_documento(clave, CHECKSUM)) == clave


@pytest.mark.parametrize("clave", ["doc-rechazado", "doc@con-arroba"])
def test_la_clave_del_documento_se_recupera_del_identificador_de_un_rechazado_o_de_un_error(
    clave: str,
) -> None:
    assert clave_del_documento(identificador_de_rechazado(clave)) == clave
    assert clave_del_documento(identificador_de_error(clave)) == clave


def test_un_identificador_sin_huella_es_la_clave_misma() -> None:
    assert clave_del_documento("doc-sin-huella") == "doc-sin-huella"
