"""Verificador del JWT de servicio (ES256, algoritmo fijado)."""

from cryptography.hazmat.primitives.asymmetric import ec

from app.application.ports import Clock


class ServiceJwtVerifier:
    """Implementa `ServiceTokenVerifierPort`."""

    def __init__(
        self, public_key: ec.EllipticCurvePublicKey, clock: Clock, ttl_seconds: int, skew_seconds: int
    ) -> None:
        self._public_key = public_key
        self._clock = clock
        self._ttl_seconds = ttl_seconds
        self._skew_seconds = skew_seconds

    def verificar(self, token: str | None) -> None:
        raise NotImplementedError
