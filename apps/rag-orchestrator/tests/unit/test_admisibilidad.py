"""Admisibilidad por fuente y licencia (RN-21, D-09): regla pura, sin adapters."""

from __future__ import annotations

import pytest

from app.domain.corpus_seed.admisibilidad import MotivoDeRechazo, evaluar_admisibilidad
from tests.support.semilla import documento_de_prueba, politica_de_test


def test_rechaza_con_sin_licencia_un_documento_que_no_declara_licencia() -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(license=None), politica_de_test())

    assert admision.motivo is MotivoDeRechazo.SIN_LICENCIA and not admision.admitido


@pytest.mark.parametrize("licencia", ["CC BY-ND 4.0", "cc by-nc-nd 4.0", "CC BY-ND"])
def test_rechaza_con_licencia_no_aceptada_toda_licencia_nd(licencia: str) -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(license=licencia), politica_de_test())

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


@pytest.mark.parametrize("licencia", ["  cc by 4.0 ", "CC   BY\t4.0", "Cc By 4.0"])
def test_compara_la_licencia_sin_distinguir_mayusculas_ni_espacios_de_mas(licencia: str) -> None:
    admision = evaluar_admisibilidad(documento_de_prueba(license=licencia), politica_de_test())

    assert admision.license_class == "cc_by"
