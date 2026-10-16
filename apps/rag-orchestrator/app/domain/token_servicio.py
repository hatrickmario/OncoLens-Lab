"""Rechazo del JWT de servicio: el motivo es cerrado y solo va al log, nunca a la respuesta (sin oráculo)."""

from datetime import datetime
from typing import Literal

MotivoTokenInvalido = Literal[
    "ausente", "malformado", "algoritmo", "firma", "emisor", "audiencia", "expirado", "vida_maxima"
]


class TokenServicioInvalido(Exception):
    """El JWT de servicio falta o no es válido."""

    def __init__(self, motivo: MotivoTokenInvalido) -> None:
        super().__init__(motivo)
        self.motivo = motivo


def vigencia_dentro_del_maximo(
    iat: int, exp: int, ahora: datetime, *, ttl_seconds: int, skew_seconds: int
) -> None:
    """Rechaza el token expirado, emitido en el futuro o con vida mayor que `SERVICE_JWT_TTL_SECONDS` (US-054 AC-5)."""
    ahora_s = ahora.timestamp()
    if iat > ahora_s + skew_seconds:
        raise TokenServicioInvalido("malformado")
    if exp <= ahora_s - skew_seconds:
        raise TokenServicioInvalido("expirado")
    if exp - iat > ttl_seconds:
        raise TokenServicioInvalido("vida_maxima")
