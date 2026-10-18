"""Verificación de los archivos de modelo al arrancar (RN-22): ruta y SHA-256 esperado vienen de la configuración."""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import Callable, Iterable
from pathlib import Path

TAMANO_DE_BLOQUE = 1 << 20


class ModeloNoVerificadoError(RuntimeError):
    """Falta un archivo de modelo o su SHA-256 no coincide. El mensaje es solo el NOMBRE de la variable de
    configuración: nunca la ruta, el hash esperado ni el calculado."""

    def __init__(self, variable: str) -> None:
        super().__init__(variable)
        self.variable = variable


def leer_por_bloques(ruta: Path) -> Iterable[bytes]:
    with ruta.open("rb") as archivo:
        while bloque := archivo.read(TAMANO_DE_BLOQUE):
            yield bloque


def calcular_sha256(bloques: Iterable[bytes]) -> str:
    resumen = hashlib.sha256()
    for bloque in bloques:
        resumen.update(bloque)
    return resumen.hexdigest()


def verificar_modelo(
    variable_ruta: str,
    variable_sha: str,
    ruta: Path | None,
    sha_esperado: str | None,
    *,
    leer_bloques: Callable[[Path], Iterable[bytes]] = leer_por_bloques,
) -> None:
    """Comprueba que el archivo existe y que su SHA-256 es el esperado; si no, nombra la variable infractora.

    Se lanza siempre con ``from None``: ni la ruta ni los hashes viajan en el mensaje, en la causa ni en los logs.
    """
    _exigir_declarado(variable_ruta, variable_sha, ruta, sha_esperado)
    try:
        calculado = calcular_sha256(leer_bloques(ruta))  # type: ignore[arg-type]
    except OSError:
        raise ModeloNoVerificadoError(variable_ruta) from None
    _exigir_coincidencia(variable_sha, calculado, sha_esperado)  # type: ignore[arg-type]


def leer_modelo_verificado(
    variable_ruta: str,
    variable_sha: str,
    ruta: Path | None,
    sha_esperado: str | None,
    *,
    leer: Callable[[Path], bytes] = Path.read_bytes,
) -> bytes:
    """Lee el archivo UNA vez y comprueba el SHA-256 de esos mismos bytes: lo que se carga es exactamente lo verificado.

    Quien crea la sesión con estos bytes no vuelve a abrir la ruta, así que un cambio posterior del archivo (o un
    archivo de datos vecino no declarado) no entra al proceso (US-231b D12).
    """
    _exigir_declarado(variable_ruta, variable_sha, ruta, sha_esperado)
    try:
        contenido = leer(ruta)  # type: ignore[arg-type]
    except OSError:
        raise ModeloNoVerificadoError(variable_ruta) from None
    _exigir_coincidencia(variable_sha, calcular_sha256([contenido]), sha_esperado)  # type: ignore[arg-type]
    return contenido


def _exigir_declarado(
    variable_ruta: str, variable_sha: str, ruta: Path | None, sha_esperado: str | None
) -> None:
    if ruta is None:
        raise ModeloNoVerificadoError(variable_ruta)
    if not sha_esperado:
        raise ModeloNoVerificadoError(variable_sha)


def _exigir_coincidencia(variable_sha: str, calculado: str, sha_esperado: str) -> None:
    if not hmac.compare_digest(calculado, sha_esperado.lower()):
        raise ModeloNoVerificadoError(variable_sha) from None
