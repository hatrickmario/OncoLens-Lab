"""Admisibilidad por fuente y licencia (RN-21, D-09): regla pura, sin adapters."""

from __future__ import annotations

from dataclasses import replace

import pytest

from app.domain.corpus_seed.admisibilidad import (
    MotivoDeRechazo,
    clase_contradice_el_texto,
    es_fuente_excluida,
    evaluar_admisibilidad,
)
from tests.support.semilla import documento_de_prueba, politica_de_test


def test_rechaza_con_fuente_excluida_aunque_declare_una_licencia_aceptada() -> None:
    admision = evaluar_admisibilidad(
        documento_de_prueba(source_name="NCCN", license="Dominio público"), politica_de_test()
    )

    assert admision.motivo is MotivoDeRechazo.FUENTE_EXCLUIDA


@pytest.mark.parametrize("fuente", ["nccn", "  NCCN  ", "Esmo", "ESMO"])
def test_compara_la_fuente_excluida_sin_distinguir_mayusculas_ni_espacios_de_los_extremos(
    fuente: str,
) -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(source_name=fuente), politica_de_test())

    assert admision.motivo is MotivoDeRechazo.FUENTE_EXCLUIDA


def test_la_fuente_excluida_gana_a_la_falta_de_licencia() -> None:
    admision = evaluar_admisibilidad(
        documento_de_prueba(source_name="NCCN", license=None), politica_de_test()
    )

    assert admision.motivo is MotivoDeRechazo.FUENTE_EXCLUIDA


def test_una_fuente_con_el_nombre_de_una_excluida_dentro_de_otro_no_se_excluye() -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(source_name="NCCNx"), politica_de_test())

    assert admision.admitido


def test_rechaza_con_sin_licencia_un_documento_que_no_declara_licencia() -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(license=None), politica_de_test())

    assert admision.motivo is MotivoDeRechazo.SIN_LICENCIA and not admision.admitido


@pytest.mark.parametrize("licencia", ["CC BY-ND 4.0", "cc by-nc-nd 4.0", "CC BY-ND"])
def test_rechaza_con_licencia_no_aceptada_toda_licencia_nd(licencia: str) -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(license=licencia), politica_de_test())

    assert admision.motivo is MotivoDeRechazo.LICENCIA_NO_ACEPTADA


def test_una_licencia_nd_se_rechaza_aunque_la_tabla_de_configuracion_la_mapee_a_una_clase_aceptada() -> (
    None
):
    politica = replace(
        politica_de_test(), mapa_de_clases={"cc by-nd 4.0": "cc_by", "cc by 4.0": "cc_by"}
    )

    admision = evaluar_admisibilidad(documento_de_prueba(license="CC BY-ND 4.0"), politica)

    assert admision.motivo is MotivoDeRechazo.LICENCIA_NO_ACEPTADA


def test_admite_un_documento_con_licencia_aceptada_y_devuelve_su_clase() -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(), politica_de_test())

    assert admision.admitido and admision.license_class == "dominio_publico"


def test_rechaza_con_licencia_no_aceptada_un_texto_de_licencia_que_no_mapea_a_ninguna_clase() -> (
    None
):
    admision = evaluar_admisibilidad(
        documento_de_prueba(license="Todos los derechos reservados"), politica_de_test()
    )

    assert admision.motivo is MotivoDeRechazo.LICENCIA_NO_ACEPTADA


def test_rechaza_una_clase_que_no_esta_en_las_licencias_aceptadas_de_la_configuracion() -> None:
    admision = evaluar_admisibilidad(
        documento_de_prueba(license="CC BY-NC 4.0", nc_solo_academico=True), politica_de_test()
    )

    assert admision.motivo is MotivoDeRechazo.LICENCIA_NO_ACEPTADA


CON_NC = frozenset({"dominio_publico", "cc_by", "cc_by_sa", "cc_by_nc"})


@pytest.mark.parametrize(
    ("aceptadas", "permitir", "academico"),
    [
        (CON_NC, False, True),  # sin ALLOW_CC_BY_NC
        (CON_NC, True, False),  # el documento no declara nc_solo_academico
        (frozenset({"cc_by"}), True, True),  # cc_by_nc fuera de CORPUS_ACCEPTED_LICENSES
    ],
)
def test_cc_by_nc_se_rechaza_si_falta_cualquiera_de_sus_tres_condiciones(
    aceptadas: frozenset[str], permitir: bool, academico: bool
) -> None:
    documento = documento_de_prueba(license="CC BY-NC 4.0", nc_solo_academico=academico)

    admision = evaluar_admisibilidad(
        documento, politica_de_test(aceptadas=aceptadas, permitir_cc_by_nc=permitir)
    )

    assert admision.motivo is MotivoDeRechazo.LICENCIA_NO_ACEPTADA


def test_cc_by_nc_se_admite_con_sus_tres_condiciones_y_queda_marcada_como_tal() -> None:
    documento = documento_de_prueba(license="CC BY-NC 4.0", nc_solo_academico=True)

    admision = evaluar_admisibilidad(
        documento, politica_de_test(aceptadas=CON_NC, permitir_cc_by_nc=True)
    )

    assert admision.admitido and admision.license_class == "cc_by_nc"


@pytest.mark.parametrize(
    "licencia",
    [
        "CC BY-NC 4.0",
        "Creative Commons Attribution-NonCommercial 4.0",
        "CC BY No Comercial 4.0",
        "cc by-nc-sa 4.0",
    ],
)
def test_el_texto_nc_gana_al_mapa_y_cae_en_cc_by_nc_aunque_el_mapa_diga_otra_clase(
    licencia: str,
) -> None:
    mapa = {licencia.casefold(): "cc_by"}
    politica = replace(politica_de_test(), mapa_de_clases=mapa)  # cc_by_nc NO está aceptada

    admision = evaluar_admisibilidad(documento_de_prueba(license=licencia), politica)

    assert admision.motivo is MotivoDeRechazo.LICENCIA_NO_ACEPTADA


@pytest.mark.parametrize(
    "licencia",
    [
        "CC BY-ND 4.0",
        "CC BY NoDerivs 4.0",
        "Creative Commons Attribution-NoDerivatives 4.0",
        "CC BY No Derivative Works",
        "CC BY sin obras derivadas",
    ],
)
def test_toda_variante_de_nd_se_rechaza_aunque_el_mapa_la_acepte(licencia: str) -> None:
    politica = replace(politica_de_test(), mapa_de_clases={licencia.casefold(): "cc_by"})

    admision = evaluar_admisibilidad(documento_de_prueba(license=licencia), politica)

    assert admision.motivo is MotivoDeRechazo.LICENCIA_NO_ACEPTADA


def test_nci_no_se_confunde_con_nc() -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(), politica_de_test())

    assert admision.admitido and admision.license_class == "dominio_publico"


@pytest.mark.parametrize(
    "fuente",
    [
        "National Comprehensive Cancer Network",
        "NCCN Guidelines®",
        "European Society for Medical Oncology",
        "ESMO Clinical Practice Guidelines",
        "  nccn  ",
    ],
)
def test_una_fuente_excluida_se_reconoce_por_su_alias_o_por_el_token_en_el_nombre(
    fuente: str,
) -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(source_name=fuente), politica_de_test())

    assert admision.motivo is MotivoDeRechazo.FUENTE_EXCLUIDA


@pytest.mark.parametrize(
    "campo",
    [
        {"external_id": "https://www.nccn.org/guidelines/category_1"},
        {"external_id": "https://guidelines.NCCN.org/x"},
        {"url_fuente": "https://www.esmo.org/guidelines/breast", "texto": None},
    ],
)
def test_una_fuente_excluida_se_reconoce_por_el_host_del_identificador_o_de_la_url(
    campo: dict[str, object],
) -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(**campo), politica_de_test())

    assert admision.motivo is MotivoDeRechazo.FUENTE_EXCLUIDA


@pytest.mark.parametrize(
    "campo",
    [
        {"external_id": "https://www.cancer.gov/types/breast"},
        {"external_id": "https://notnccn.org/x"},
        {"external_id": "10.3390/curroncol32080444"},
    ],
)
def test_un_host_que_no_es_el_de_una_fuente_excluida_no_la_excluye(
    campo: dict[str, object],
) -> None:
    assert evaluar_admisibilidad(documento_de_prueba(**campo), politica_de_test()).admitido


@pytest.mark.parametrize("licencia", ["  cc by 4.0 ", "CC   BY\t4.0", "Cc By 4.0"])
def test_compara_la_licencia_sin_distinguir_mayusculas_ni_espacios_de_mas(licencia: str) -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(license=licencia), politica_de_test())

    assert admision.license_class == "cc_by"


POLITICA_SIN_EXCLUIDAS = replace(politica_de_test(), excluidas=())


@pytest.mark.parametrize("excluidas", [(), ("Foo",), ("Foo", "Bar")])
@pytest.mark.parametrize("fuente", ["NCCN", "ESMO", "National Comprehensive Cancer Network"])
def test_la_configuracion_solo_amplia_el_piso_de_nccn_y_esmo_nunca_lo_quita(
    excluidas: tuple[str, ...], fuente: str
) -> None:
    politica = replace(politica_de_test(), excluidas=excluidas)

    admision = evaluar_admisibilidad(documento_de_prueba(source_name=fuente), politica)

    assert admision.motivo is MotivoDeRechazo.FUENTE_EXCLUIDA


@pytest.mark.parametrize("host", ["https://www.nccn.org/x", "https://www.esmo.org/x"])
def test_el_piso_tambien_cubre_los_hosts_aunque_la_configuracion_este_vacia(host: str) -> None:
    documento = documento_de_prueba(external_id=host)

    assert (
        evaluar_admisibilidad(documento, POLITICA_SIN_EXCLUIDAS).motivo
        is MotivoDeRechazo.FUENTE_EXCLUIDA
    )


def test_una_fuente_agregada_por_configuracion_se_excluye_por_nombre() -> None:
    politica = replace(politica_de_test(), excluidas=("NCCN", "ESMO", "Foo"))

    admision = evaluar_admisibilidad(documento_de_prueba(source_name="Foo Guidelines"), politica)

    assert admision.motivo is MotivoDeRechazo.FUENTE_EXCLUIDA


def test_no_se_inventan_hosts_para_una_fuente_agregada_por_configuracion() -> None:
    politica = replace(politica_de_test(), excluidas=("NCCN", "ESMO", "Foo"))

    admision = evaluar_admisibilidad(documento_de_prueba(external_id="https://foo.org/x"), politica)

    assert admision.admitido


@pytest.mark.parametrize("fuente", ["ESMO Open", "ESMO Clinical Practice Guidelines", "esmo"])
def test_esmo_open_se_rechaza_porque_la_regla_falla_cerrado(fuente: str) -> None:
    """Una excepción para «ESMO Open» exigiría una revisión legal explícita (design.md); hoy se rechaza."""
    admision = evaluar_admisibilidad(documento_de_prueba(source_name=fuente), politica_de_test())

    assert admision.motivo is MotivoDeRechazo.FUENTE_EXCLUIDA


@pytest.mark.parametrize(
    ("configuradas", "esperadas"),
    [
        ((), ("NCCN", "ESMO")),
        (("NCCN", "ESMO"), ("NCCN", "ESMO")),
        (("nccn", "Foo"), ("nccn", "Foo", "ESMO")),
    ],
)
def test_las_fuentes_excluidas_efectivas_incluyen_el_piso_sin_duplicar(
    configuradas: tuple[str, ...], esperadas: tuple[str, ...]
) -> None:
    politica = replace(politica_de_test(), excluidas=configuradas)

    assert politica.fuentes_excluidas() == esperadas


@pytest.mark.parametrize(
    ("texto", "clase", "contradice"),
    [
        ("cc by-nc 4.0", "cc_by", True),
        ("cc by-nc-sa 4.0", "cc_by_sa", True),
        ("attribution-noncommercial", "dominio_publico", True),
        ("cc by-sa 4.0", "cc_by", True),
        ("cc by-nd 4.0", "cc_by", True),
        ("cc by-nd 4.0", "cc_by_nc", True),
        ("cc by noderivs 4.0", "cc_by", True),
        ("cc by-nc 4.0", "cc_by_nc", False),
        ("cc by-nc-sa 4.0", "cc_by_nc", False),
        ("cc by-sa 4.0", "cc_by_sa", False),
        ("cc by 4.0", "cc_by", False),
        ("texto de nci libre de copyright", "dominio_publico", False),
    ],
)
def test_una_clave_de_la_tabla_que_contradice_su_clase_se_detecta_en_el_dominio(
    texto: str, clase: str, contradice: bool
) -> None:
    assert clase_contradice_el_texto(texto, clase) is contradice


def test_es_fuente_excluida_incluye_el_piso_por_si_sola_aunque_la_configuracion_este_vacia() -> (
    None
):
    documento = documento_de_prueba(source_name="NCCN")

    assert es_fuente_excluida(documento, POLITICA_SIN_EXCLUIDAS) is True


@pytest.mark.parametrize(
    "campo",
    [
        {"external_id": "nccn.org/guidelines/category_1"},
        {"external_id": "www.esmo.org/guidelines/breast"},
        {"external_id": "//www.nccn.org/x"},
        {"url_fuente": "www.NCCN.org/x", "texto": None},
    ],
)
def test_el_host_se_extrae_aunque_el_identificador_no_traiga_esquema(
    campo: dict[str, object],
) -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(**campo), politica_de_test())

    assert admision.motivo is MotivoDeRechazo.FUENTE_EXCLUIDA


@pytest.mark.parametrize("fuente", ["N.C.C.N.", "n.c.c.n", "E.S.M.O.", "NCCN."])
def test_la_sigla_con_puntos_tambien_es_la_fuente_excluida(fuente: str) -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(source_name=fuente), politica_de_test())

    assert admision.motivo is MotivoDeRechazo.FUENTE_EXCLUIDA


@pytest.mark.parametrize("fuente", ["A.B.C.", "Dr. N. C. Smith", "NCI"])
def test_una_sigla_con_puntos_que_no_es_nccn_ni_esmo_no_se_excluye(fuente: str) -> None:
    assert evaluar_admisibilidad(
        documento_de_prueba(source_name=fuente), politica_de_test()
    ).admitido


@pytest.mark.parametrize(
    "campo",
    [
        {"source_name": "Annals of Oncology"},
        {"source_name": "annals  of oncology"},
        {"external_id": "10.1016/j.annonc.2020.01.001"},
        {"external_id": "https://doi.org/10.1016/J.ESMOOP.2021.100123"},
        {"external_id": "doi:10.1016/j.esmogo.2024.100001"},
        {"url_fuente": "https://doi.org/10.1016/j.annonc.2019.12.002", "texto": None},
        {"external_id": "https://www.annalsofoncology.org/article/S0923-7534(20)00001-1/fulltext"},
        {"external_id": "https://www.esmoopen.com/article/S2059-7029(21)00001-1/fulltext"},
        {"external_id": "https://example.org/mirror/10.1016/j.annonc.2020.1"},
    ],
)
def test_las_revistas_de_esmo_se_excluyen_por_nombre_doi_o_host(campo: dict[str, object]) -> None:
    """Las revistas de ESMO (ESMO Open, Annals of Oncology) cuentan como ESMO aunque su URL no sea esmo.org (P1)."""
    admision = evaluar_admisibilidad(documento_de_prueba(**campo), politica_de_test())

    assert admision.motivo is MotivoDeRechazo.FUENTE_EXCLUIDA


@pytest.mark.parametrize(
    "campo",
    [
        {"external_id": "10.1016/j.ejca.2020.01.001"},
        {"external_id": "10.1016/j.annoncology.2020.01.001"},
        {"source_name": "Annals of Surgery"},
    ],
)
def test_una_revista_ajena_a_esmo_no_se_excluye_por_parecerse(campo: dict[str, object]) -> None:
    assert evaluar_admisibilidad(documento_de_prueba(**campo), POLITICA_SIN_EXCLUIDAS).admitido


def test_las_revistas_de_esmo_se_excluyen_aunque_la_configuracion_este_vacia() -> None:
    documento = documento_de_prueba(external_id="10.1016/j.esmoop.2021.100123")

    assert (
        evaluar_admisibilidad(documento, POLITICA_SIN_EXCLUIDAS).motivo
        is MotivoDeRechazo.FUENTE_EXCLUIDA
    )
