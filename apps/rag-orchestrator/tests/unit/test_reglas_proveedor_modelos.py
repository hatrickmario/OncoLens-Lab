"""MODEL_PROVIDER con datos reales (US-231a AC-7, RN-13): la misma regla que LLM_PROVIDER, nombrando la variable."""

import pytest

from app.domain.reglas_proveedor import reject_fake_model_provider_with_real_data


@pytest.mark.parametrize("anonimizados,identificados", [(True, False), (False, True), (True, True)])
def test_reject_fake_model_provider_nombra_model_provider_y_solo_las_banderas_activas(
    anonimizados, identificados
):
    with pytest.raises(ValueError, match="MODEL_PROVIDER") as error:
        reject_fake_model_provider_with_real_data("fake", anonimizados, identificados)

    assert ("REAL_ANONYMIZED_ENABLED" in str(error.value)) is anonimizados
    assert ("REAL_IDENTIFIED_ENABLED" in str(error.value)) is identificados


def test_reject_fake_model_provider_no_lanza_sin_datos_reales():
    reject_fake_model_provider_with_real_data("fake", False, False)


@pytest.mark.parametrize("anonimizados,identificados", [(True, False), (False, True), (True, True)])
def test_reject_fake_model_provider_no_lanza_con_proveedor_local(anonimizados, identificados):
    reject_fake_model_provider_with_real_data("local", anonimizados, identificados)
