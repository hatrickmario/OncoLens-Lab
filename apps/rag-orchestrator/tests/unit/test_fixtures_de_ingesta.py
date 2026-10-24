"""Fixture FX-06c-b y fakes de la ingesta (US-117a, tarea 1.1): se leen sin error y cumplen el contrato de los puertos."""

from __future__ import annotations

from app.infrastructure.seed_manifest.lector import leer_manifiesto
from tests.support.ingesta import (
    MANIFIESTO_FX_06C_B,
    MANIFIESTO_FX_06C_B_CON_FALLO,
    CodificadorSparseFalso,
)


def test_el_manifiesto_fx_06c_b_se_lee_sin_i_gl_1_v2() -> None:
    claves = [d.document_key for d in leer_manifiesto(MANIFIESTO_FX_06C_B)]

    assert claves == ["i-ct-1", "i-lit-1", "i-lit-2", "i-gl-1", "i-nd", "i-esmo"]


def test_el_manifiesto_con_fallo_agrega_solo_i_roto() -> None:
    base = [d.document_key for d in leer_manifiesto(MANIFIESTO_FX_06C_B)]
    con_fallo = [d.document_key for d in leer_manifiesto(MANIFIESTO_FX_06C_B_CON_FALLO)]

    assert con_fallo == [*base, "i-roto"]


def test_el_codificador_sparse_falso_devuelve_un_mapa_no_vacio_por_texto_en_orden() -> None:
    codificador = CodificadorSparseFalso()

    mapas = codificador.codificar(["uno dos", "", "tres"])

    assert len(mapas) == 3
    assert all(len(m) >= 1 for m in mapas)
    assert mapas[0] != mapas[2]


def test_el_codificador_sparse_falso_es_determinista() -> None:
    assert CodificadorSparseFalso().codificar(
        ["mismo texto"]
    ) == CodificadorSparseFalso().codificar(["mismo texto"])
