"""Versionado e idempotencia por checksum (RN-05, US-059 D5): reglas puras, sin adapters."""

from __future__ import annotations

from app.domain.corpus_seed.versionado import (
    Accion,
    VersionExistente,
    calcular_checksum,
    debe_publicar_release,
    decidir_retiro,
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


def test_una_version_vigente_con_otro_checksum_se_reemplaza_y_nombra_a_la_anterior() -> None:
    decision = decidir_version("c2", [version("a@1", "c1")])

    assert (decision.accion, decision.anterior_id) == (Accion.REEMPLAZAR, "a@1")


def test_un_reintento_tras_un_error_reemplaza_a_la_version_vigente_que_sigue_en_pie() -> None:
    existentes = [version("a@1", "c1"), version("a@2", "c2", vigente=False, status="error")]

    decision = decidir_version("c2", existentes)

    assert (decision.accion, decision.anterior_id) == (Accion.REEMPLAZAR, "a@1")


def test_una_version_vigente_con_error_no_es_la_version_a_reemplazar() -> None:
    existentes = [version("a@1", "c1", vigente=True, status="error")]

    assert decidir_version("c2", existentes).accion is Accion.INSERTAR


def test_el_checksum_de_una_version_antigua_ya_embebida_se_omite_en_lugar_de_resucitarla() -> None:
    historico = [
        version("a@1", "c1", vigente=False),
        version("a@2", "c2", vigente=False),
        version("a@3", "c3"),
    ]

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


def test_reemplazar_apaga_la_vigente_anterior_y_toda_version_del_grupo_que_no_este_embebida() -> (
    None
):
    existentes = [
        version("a@1", "c1"),
        version("a@2", "c2", vigente=False, status="error"),
        version("a@rechazado", "", vigente=False, status="rechazado_licencia"),
    ]

    decision = decidir_version("c3", existentes)

    assert decision.accion is Accion.REEMPLAZAR
    assert set(decision.a_apagar) == {"a@1", "a@2", "a@rechazado"} and decision.anterior_id == "a@1"


def test_insertar_apaga_las_versiones_no_embebidas_de_otro_contenido_pero_no_el_reintento_propio() -> (
    None
):
    existentes = [
        version("a@2", "c2", vigente=False, status="error"),
        version("a@3", "c3", vigente=False, status="error"),  # el reintento del mismo contenido
    ]

    decision = decidir_version("c3", existentes)

    assert decision.accion is Accion.INSERTAR and decision.a_apagar == ("a@2",)


def test_omitir_tambien_apaga_los_chunks_de_las_versiones_no_embebidas_de_otro_contenido() -> None:
    """Volver al texto de la versión vigente tras un fallo no deja vigentes los chunks de la que falló."""
    existentes = [version("a@1", "c1"), version("a@2", "c2", vigente=False, status="error")]

    decision = decidir_version("c1", existentes)

    assert decision.accion is Accion.OMITIR and decision.a_apagar == ("a@2",)


def test_sin_versiones_no_embebidas_ni_vigente_no_hay_nada_que_apagar() -> None:
    assert decidir_version("c1", []).a_apagar == ()
    assert decidir_version("c1", [version("a@1", "c1")]).a_apagar == ()


def test_el_retiro_apaga_la_vigente_y_las_versiones_no_embebidas_del_grupo() -> None:
    existentes = [
        version("a@1", "c1", vigente=False),
        version("a@2", "c2"),
        version("a@3", "c3", vigente=False, status="error"),
    ]

    retiro = decidir_retiro(existentes)

    assert retiro.vigente_id == "a@2" and set(retiro.a_apagar) == {"a@2", "a@3"}


def test_un_grupo_sin_vigente_no_tiene_nada_que_retirar_pero_si_huerfanas_que_apagar() -> None:
    assert decidir_retiro([]).vigente_id is None and decidir_retiro([]).a_apagar == ()
    sin_vigente = [
        version("a@1", "c1", vigente=False),
        version("a@2", "c2", vigente=False, status="error"),
    ]

    retiro = decidir_retiro(sin_vigente)

    assert retiro.vigente_id is None and retiro.a_apagar == ("a@2",)


def test_la_release_se_publica_tambien_cuando_el_conjunto_vigente_queda_vacio() -> None:
    assert debe_publicar_release(frozenset(), frozenset({"a"})) is True


def test_el_checksum_de_una_version_retirada_sin_vigente_en_el_grupo_se_reingiere_en_lugar_de_omitirse() -> (
    None
):
    """Tras un retiro por licencia o fuente no queda vigente: volver con el mismo texto lo readmite."""
    retirada = [version("a@1", "c1", vigente=False)]

    assert decidir_version("c1", retirada).accion is Accion.INSERTAR


def test_el_checksum_de_la_version_vigente_se_omite() -> None:
    assert decidir_version("c1", [version("a@1", "c1")]).accion is Accion.OMITIR
