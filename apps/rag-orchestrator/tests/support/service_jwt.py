"""JWT de servicio para los tests (US-054): par ES256 efímero en memoria y constructor de tokens.

Nunca hay claves en el repositorio (RN-14): cada sesión de Pytest genera su par. El reloj es el
`RelojFijo` de `tests/support/fakes.py`, así que `iat`/`exp` salen del instante congelado. Lo reutiliza
L1D-106 (`/rag/query` real) para entregar un token válido a sus tests.
"""

import base64
import hashlib
import hmac
import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

AHORA = datetime(2026, 10, 16, 12, 0, 0, tzinfo=timezone.utc)
EMISOR = "clinical-api"
AUDIENCIA = "rag-orchestrator"
VIDA_VALIDA_SEGUNDOS = 60
TTL_DE_PRUEBA_SEGUNDOS = 60
SKEW_DE_PRUEBA_SEGUNDOS = 5


@dataclass(frozen=True)
class ParClavesServicio:
    privada_pem: bytes
    publica_pem: bytes


def generar_par_es256() -> ParClavesServicio:
    privada = ec.generate_private_key(ec.SECP256R1())
    return ParClavesServicio(
        privada_pem=privada.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ),
        publica_pem=privada.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        ),
    )


def escribir_clave_publica(par: ParClavesServicio, directorio: Path) -> Path:
    """Escribe la pública donde `SERVICE_JWT_PUBLIC_KEY_FILE` la espera."""
    ruta = directorio / "jwt_service_public.pem"
    ruta.write_bytes(par.publica_pem)
    return ruta


def _segundos(instante: datetime) -> int:
    return int(instante.timestamp())


def _claims(
    ahora: datetime, *, iss: str, aud: str, vida: int, iat_desfase: int, omitir: tuple[str, ...]
) -> dict[str, Any]:
    iat = _segundos(ahora) + iat_desfase
    claims: dict[str, Any] = {"iss": iss, "aud": aud, "iat": iat, "exp": iat + vida}
    for nombre in omitir:
        del claims[nombre]
    return claims


def token_es256(
    par: ParClavesServicio,
    ahora: datetime = AHORA,
    *,
    iss: str = EMISOR,
    aud: str = AUDIENCIA,
    vida: int = VIDA_VALIDA_SEGUNDOS,
    iat_desfase: int = 0,
    omitir: tuple[str, ...] = (),
) -> str:
    """Token ES256 firmado con la privada del par; los parámetros degradan un claim a la vez."""
    claims = _claims(ahora, iss=iss, aud=aud, vida=vida, iat_desfase=iat_desfase, omitir=omitir)
    return jwt.encode(claims, par.privada_pem, algorithm="ES256", headers={"typ": "JWT"})


def _base64url(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode()


def _json_base64url(valor: dict[str, Any]) -> str:
    return _base64url(json.dumps(valor, separators=(",", ":")).encode())


def token_alg_none(ahora: datetime = AHORA) -> str:
    """JWT sin firma (`alg: none`) con claims válidos."""
    cabecera = _json_base64url({"alg": "none", "typ": "JWT"})
    return f"{cabecera}.{_json_base64url(_claims(ahora, iss=EMISOR, aud=AUDIENCIA, vida=VIDA_VALIDA_SEGUNDOS, iat_desfase=0, omitir=()))}."


def token_hs256_con_publica(par: ParClavesServicio, ahora: datetime = AHORA) -> str:
    """Ataque de confusión de algoritmo: HS256 firmado con la clave pública como secreto."""
    cabecera = _json_base64url({"alg": "HS256", "typ": "JWT"})
    cuerpo = _json_base64url(
        _claims(ahora, iss=EMISOR, aud=AUDIENCIA, vida=VIDA_VALIDA_SEGUNDOS, iat_desfase=0, omitir=())
    )
    firma = hmac.new(par.publica_pem, f"{cabecera}.{cuerpo}".encode(), hashlib.sha256).digest()
    return f"{cabecera}.{cuerpo}.{_base64url(firma)}"


def cabecera_bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def con_token_valido(par: ParClavesServicio) -> dict[str, str]:
    """Cabeceras con un JWT de servicio válido al instante congelado."""
    return cabecera_bearer(token_es256(par))


_ConstructorDeCabeceras = Callable[[ParClavesServicio], dict[str, str]]

# Variantes de AC-2: cada una debe terminar en 401 sin invocar al LLM. Clave: id del caso de prueba.
VARIANTES_INVALIDAS: dict[str, _ConstructorDeCabeceras] = {
    "sin_cabecera": lambda par: {},
    "expirado": lambda par: cabecera_bearer(token_es256(par, iat_desfase=-7200)),
    "audiencia_ajena": lambda par: cabecera_bearer(token_es256(par, aud="otro-servicio")),
    "emisor_ajeno": lambda par: cabecera_bearer(token_es256(par, iss="otro-emisor")),
    "alg_none": lambda par: cabecera_bearer(token_alg_none()),
    "hs256_con_clave_publica": lambda par: cabecera_bearer(token_hs256_con_publica(par)),
    "firmado_con_otra_clave": lambda par: cabecera_bearer(token_es256(generar_par_es256())),
}
