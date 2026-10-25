"""Reglas puras de proveedores de modelos (RN-12, RN-13)."""

import ipaddress
import re
import unicodedata
from urllib.parse import urlsplit

# Piso CERRADO EN CÓDIGO de la suite de evaluación (ADR-41 D4): `es_proveedor_local()` no lee configuración, así que
# ninguna variable ni YAML la amplía. ``Settings.llm_allowed_hosts`` toma de aquí su valor por defecto, y
# ``LLM_ALLOWED_HOSTS`` lo sustituye por entorno en el arranque del servicio (RN-22); eso no afecta a la suite.
HOSTS_LOCALES: frozenset[str] = frozenset({"localhost", "127.0.0.1", "::1", "host.docker.internal"})


def es_proveedor_local(url: str) -> bool:
    """RN-12: ``True`` solo si el host de ``url`` es loopback (``127.0.0.0/8``, ``::1``), ``localhost`` o
    ``host.docker.internal``. Falla cerrada: una URL sin host o que no se puede interpretar no es local."""
    try:
        host = urlsplit(url).hostname
    except ValueError:
        return False
    if not host:
        return False
    if host in HOSTS_LOCALES:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def variable_que_incumple_llm_local(*, llm_cloud_enabled: bool, llm_provider: str) -> str | None:
    """RN-12: nombre de la variable de configuración que impide usar solo el LLM local, o ``None`` si cumple."""
    raise NotImplementedError("no implementado")


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


_SUFIJO_DE_NUBE = re.compile(r"(?:^|[:\-])cloud$", re.IGNORECASE)


def es_modelo_de_nube(modelo: str) -> bool:
    """RN-12: un runtime local (Ollama) sirve ``x:cloud`` o ``x:1b-cloud`` ejecutándolos en la nube, aunque el host sea local."""
    normalizado = (
        unicodedata.normalize("NFKC", modelo).strip().casefold()
    )  # Ollama resuelve el nombre con ruido
    return _SUFIJO_DE_NUBE.search(normalizado) is not None
