"""Reglas puras de proveedores de modelos (RN-12, RN-13)."""


def _banderas_de_datos_reales_activas(
    real_anonymized_enabled: bool, real_identified_enabled: bool
) -> list[str]:
    return [
        nombre
        for nombre, activa in (
            ("REAL_ANONYMIZED_ENABLED", real_anonymized_enabled),
            ("REAL_IDENTIFIED_ENABLED", real_identified_enabled),
        )
        if activa
    ]


def _rechazar_fake_con_datos_reales(
    variable: str, proveedor: str, real_anonymized_enabled: bool, real_identified_enabled: bool
) -> None:
    banderas = _banderas_de_datos_reales_activas(real_anonymized_enabled, real_identified_enabled)
    if proveedor == "fake" and banderas:
        raise ValueError(
            f"{variable} en modo fake no se admite con {', '.join(banderas)} activa (RN-13)"
        )


def reject_fake_provider_with_real_data(
    llm_provider: str, real_anonymized_enabled: bool, real_identified_enabled: bool
) -> None:
    """RN-13: el modo `fake` no arranca con datos reales habilitados; nombra variables, nunca valores."""
    _rechazar_fake_con_datos_reales(
        "LLM_PROVIDER", llm_provider, real_anonymized_enabled, real_identified_enabled
    )


def reject_fake_model_provider_with_real_data(
    model_provider: str, real_anonymized_enabled: bool, real_identified_enabled: bool
) -> None:
    """RN-13: los modelos de recuperación en `fake` tampoco arrancan con datos reales; nombra `MODEL_PROVIDER`."""
    _rechazar_fake_con_datos_reales(
        "MODEL_PROVIDER", model_provider, real_anonymized_enabled, real_identified_enabled
    )
