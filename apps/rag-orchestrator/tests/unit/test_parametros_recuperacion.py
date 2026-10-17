import dataclasses

import pytest

from app.application.rag_orchestrator_service import ParametrosDeRecuperacion
from app.schemas.generated.models import LlmProvider
from tests.support.recuperacion import PARAMETROS_DE_PRUEBA


def test_parametros_de_recuperacion_expone_llm_provider_como_enum_cuando_recibe_un_valor_del_contrato():
    parametros = dataclasses.replace(PARAMETROS_DE_PRUEBA, llm_provider="nube")

    assert parametros.llm_provider is LlmProvider.nube


@pytest.mark.parametrize("valor", ["fake", "", "LOCAL", "openai"])
def test_parametros_de_recuperacion_rechaza_un_llm_provider_fuera_del_enum(valor):
    with pytest.raises(ValueError):
        dataclasses.replace(PARAMETROS_DE_PRUEBA, llm_provider=valor)


def test_parametros_de_recuperacion_conserva_los_demas_valores_cuando_normaliza_el_proveedor():
    assert isinstance(PARAMETROS_DE_PRUEBA, ParametrosDeRecuperacion)
    assert PARAMETROS_DE_PRUEBA.llm_provider is LlmProvider.local
