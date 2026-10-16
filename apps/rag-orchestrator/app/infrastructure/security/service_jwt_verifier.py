"""Verificador del JWT de servicio de `clinical-api` (readme §6.1 #7: asimétrico, algoritmo fijado)."""

from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import ec

from app.application.ports import Clock
from app.domain.token_servicio import TokenServicioInvalido, vigencia_dentro_del_maximo

# El algoritmo no es configurable: abrirlo reintroduce la confusión de algoritmos (D1).
ALGORITMO = "ES256"
EMISOR = "clinical-api"
AUDIENCIA = "rag-orchestrator"
CLAIMS_OBLIGATORIOS = ["iss", "aud", "iat", "exp"]
# La vigencia (exp/iat) la juzga el dominio con el Clock inyectado; nbf se rechaza si está presente (no lo emite clinical-api).
OPCIONES_DE_DECODIFICACION = {
    "require": CLAIMS_OBLIGATORIOS,
    "verify_exp": False,
    "verify_iat": False,
    "verify_nbf": False,
    "strict_aud": True,
}


class ServiceJwtVerifier:
    """Implementa `ServiceTokenVerifierPort`; la vigencia la juzga el dominio con el `Clock` inyectado."""

    def __init__(
        self, public_key: ec.EllipticCurvePublicKey, clock: Clock, ttl_seconds: int, skew_seconds: int
    ) -> None:
        self._public_key = public_key
        self._clock = clock
        self._ttl_seconds = ttl_seconds
        self._skew_seconds = skew_seconds

    def verificar(self, token: str | None) -> None:
        if not token:
            raise TokenServicioInvalido("ausente")
        claims = self._claims_firmados(token)
        vigencia_dentro_del_maximo(
            claims["iat"],
            claims["exp"],
            self._clock.ahora(),
            ttl_seconds=self._ttl_seconds,
            skew_seconds=self._skew_seconds,
        )

    def _claims_firmados(self, token: str) -> dict[str, Any]:
        self._exigir_algoritmo_fijado(token)
        try:
            claims = jwt.decode(
                token,
                self._public_key,
                algorithms=[ALGORITMO],
                audience=AUDIENCIA,
                issuer=EMISOR,
                options=OPCIONES_DE_DECODIFICACION,
            )
        except jwt.InvalidSignatureError:
            raise TokenServicioInvalido("firma") from None
        except jwt.InvalidIssuerError:
            raise TokenServicioInvalido("emisor") from None
        except jwt.InvalidAudienceError:
            raise TokenServicioInvalido("audiencia") from None
        except jwt.PyJWTError:
            raise TokenServicioInvalido("malformado") from None
        if "nbf" in claims or not all(_es_entero(claims[nombre]) for nombre in ("iat", "exp")):
            raise TokenServicioInvalido("malformado")
        return claims

    @staticmethod
    def _exigir_algoritmo_fijado(token: str) -> None:
        try:
            algoritmo = jwt.get_unverified_header(token).get("alg")
        except jwt.PyJWTError:
            raise TokenServicioInvalido("malformado") from None
        if algoritmo != ALGORITMO:
            raise TokenServicioInvalido("algoritmo")


def _es_entero(valor: object) -> bool:
    return isinstance(valor, int) and not isinstance(valor, bool)
