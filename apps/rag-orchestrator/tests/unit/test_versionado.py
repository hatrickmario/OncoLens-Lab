"""Versionado e idempotencia por checksum (RN-05, US-059 D5): reglas puras, sin adapters."""

from __future__ import annotations

from app.domain.corpus_seed.versionado import calcular_checksum


def test_el_checksum_es_el_sha256_hexadecimal_del_texto_normalizado() -> None:
    assert calcular_checksum("abc") == (
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )


def test_el_checksum_cambia_con_un_solo_caracter_y_se_repite_con_el_mismo_texto() -> None:
    assert calcular_checksum("texto uno") == calcular_checksum("texto uno")
    assert calcular_checksum("texto uno") != calcular_checksum("texto dos")
