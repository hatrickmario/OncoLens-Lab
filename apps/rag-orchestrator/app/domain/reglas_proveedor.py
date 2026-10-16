"""Reglas puras de proveedores de modelos (RN-12, RN-13)."""


def reject_fake_provider_with_real_data(
    llm_provider: str, real_anonymized_enabled: bool, real_identified_enabled: bool
) -> None:
    """RN-13: el modo `fake` no arranca con datos reales habilitados; nombra variables, nunca valores."""
    if llm_provider != "fake":
        return
    banderas = [
        nombre
        for nombre, activa in (
            ("REAL_ANONYMIZED_ENABLED", real_anonymized_enabled),
            ("REAL_IDENTIFIED_ENABLED", real_identified_enabled),
        )
        if activa
    ]
    if banderas:
        raise ValueError(f"LLM_PROVIDER en modo fake no se admite con {', '.join(banderas)} activa (RN-13)")
