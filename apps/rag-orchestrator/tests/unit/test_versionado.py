"""Versionado e idempotencia por checksum (RN-05, US-059 D5): reglas puras, sin adapters."""

from __future__ import annotations

from app.domain.corpus_seed.versionado import (
    Accion,
    VersionExistente,
    calcular_checksum,
    debe_publicar_release,
    decidir_version,
)


def version(
    document_id: str, checksum: str, *, vigente: bool = True, status: str = "embebido"
) -> VersionExistente:
    return VersionExistente(document_id, checksum, vigente, status)


def test_un_grupo_sin_versiones_inserta() -> None:
    decision = decidir_version("c1", [])

    assert (decision.accion, decision.anterior_id) == (Accion.INSERTAR, None)


def test_omite_cuando_el_checksum_ya_esta_embebido_en_el_grupo() -> None:
    decision = decidir_version("c1", [version("a@1", "c1")])

    assert decision.accion is Accion.OMITIR and decision.anterior_id is None


def test_el_checksum_de_una_version_antigua_ya_embebida_se_omite_en_lugar_de_resucitarla() -> None:
    historico = [version("a@1", "c1", vigente=False), version("a@2", "c2", vigente=False)]

    assert decidir_version("c1", historico).accion is Accion.OMITIR


def test_un_reintento_tras_un_error_con_el_mismo_checksum_no_se_omite() -> None:
    decision = decidir_version("c1", [version("a@1", "c1", vigente=False, status="error")])

    assert decision.accion is Accion.INSERTAR


def test_un_documento_rechazado_del_grupo_no_cuenta_como_version_vigente_ni_como_repetido() -> None:
    rechazado = version("a@rechazado", "", vigente=False, status="rechazado_licencia")

    assert decidir_version("c1", [rechazado]).accion is Accion.INSERTAR


def test_publica_una_release_cuando_cambia_el_conjunto_de_documentos_vigentes() -> None:
    assert debe_publicar_release(frozenset({"a", "b"}), frozenset({"a"})) is True
    assert debe_publicar_release(frozenset({"b"}), frozenset({"a"})) is True


def test_no_publica_otra_release_cuando_el_conjunto_vigente_es_el_de_la_ultima() -> None:
    assert debe_publicar_release(frozenset({"a", "b"}), frozenset({"b", "a"})) is False


def test_publica_la_primera_release_si_hay_vigentes_y_ninguna_no_publica_una_release_vacia() -> (
    None
):
    assert debe_publicar_release(frozenset({"a"}), None) is True
    assert debe_publicar_release(frozenset(), None) is False


def test_el_checksum_es_el_sha256_hexadecimal_del_texto_normalizado() -> None:
    assert calcular_checksum("abc") == (
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )


def test_el_checksum_cambia_con_un_solo_caracter_y_se_repite_con_el_mismo_texto() -> None:
    assert calcular_checksum("texto uno") == calcular_checksum("texto uno")
    assert calcular_checksum("texto uno") != calcular_checksum("texto dos")
