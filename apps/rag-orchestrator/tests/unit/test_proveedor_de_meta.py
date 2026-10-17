import pytest

from app.bootstrap import _proveedor_de_meta
from app.schemas.generated.models import LlmProvider
from tests.support.fakes import settings_de_prueba


def test_proveedor_de_meta_devuelve_el_enum_local_cuando_llm_provider_es_local():
    assert _proveedor_de_meta(settings_de_prueba(llm_provider="local")) is LlmProvider.local


def test_proveedor_de_meta_rechaza_fake_cuando_la_recuperacion_real_lo_pide():
    # `fake` no es un valor del contrato de `meta`: el modo fake responde con los ejemplos y nunca llega a la recuperación.
    with pytest.raises(ValueError):
        _proveedor_de_meta(settings_de_prueba(llm_provider="fake"))
