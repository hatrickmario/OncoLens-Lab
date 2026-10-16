"""Carga de la clave pública ES256 del JWT de servicio (`SERVICE_JWT_PUBLIC_KEY_FILE`, fallo cerrado)."""

from pathlib import Path

from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import load_pem_public_key


class ClavePublicaServicioInvalida(Exception):
    """La clave pública falta, no se lee o no es EC P-256; nunca incluye su contenido."""


def cargar_clave_publica_es256(ruta: Path | None) -> ec.EllipticCurvePublicKey:
    if ruta is None:
        raise ClavePublicaServicioInvalida("SERVICE_JWT_PUBLIC_KEY_FILE no está configurada")
    try:
        contenido = ruta.read_bytes()
    except OSError:
        raise ClavePublicaServicioInvalida("SERVICE_JWT_PUBLIC_KEY_FILE no se puede leer") from None
    try:
        clave = load_pem_public_key(contenido)
    except (ValueError, UnsupportedAlgorithm):
        raise ClavePublicaServicioInvalida("SERVICE_JWT_PUBLIC_KEY_FILE no es una clave pública PEM") from None
    if not isinstance(clave, ec.EllipticCurvePublicKey) or not isinstance(clave.curve, ec.SECP256R1):
        raise ClavePublicaServicioInvalida("SERVICE_JWT_PUBLIC_KEY_FILE no es una clave pública EC P-256")
    return clave
