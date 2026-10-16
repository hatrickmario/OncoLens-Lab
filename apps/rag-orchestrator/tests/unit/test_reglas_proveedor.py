import pytest

from app.domain.reglas_proveedor import reject_fake_provider_with_real_data


def test_reject_fake_provider_with_real_data_no_lanza_cuando_el_proveedor_es_fake_sin_datos_reales():
    reject_fake_provider_with_real_data("fake", False, False)


@pytest.mark.parametrize("anonimizados,identificados", [(True, False), (False, True), (True, True)])
def test_reject_fake_provider_with_real_data_no_lanza_cuando_el_proveedor_es_local(
    anonimizados, identificados
):
    reject_fake_provider_with_real_data("local", anonimizados, identificados)


def test_reject_fake_provider_with_real_data_nombra_solo_la_bandera_activa():
    with pytest.raises(ValueError, match="REAL_IDENTIFIED_ENABLED") as error:
        reject_fake_provider_with_real_data("fake", False, True)

    assert "REAL_ANONYMIZED_ENABLED" not in str(error.value)


def test_reject_fake_provider_with_real_data_nombra_ambas_banderas_cuando_las_dos_estan_activas():
    with pytest.raises(ValueError) as error:
        reject_fake_provider_with_real_data("fake", True, True)

    assert "REAL_ANONYMIZED_ENABLED" in str(error.value)
    assert "REAL_IDENTIFIED_ENABLED" in str(error.value)
