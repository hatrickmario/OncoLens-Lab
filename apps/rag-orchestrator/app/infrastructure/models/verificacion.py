"""Verificación de los archivos de modelo al arrancar (RN-22): ruta y SHA-256 esperado vienen de la configuración."""

from __future__ import annotations

from pathlib import Path


class ModeloNoVerificadoError(RuntimeError):
    """Falta un archivo de modelo o su SHA-256 no coincide. El mensaje es solo el NOMBRE de la variable de
    configuración: nunca la ruta, el hash esperado ni el calculado."""

    def __init__(self, variable: str) -> None:
        super().__init__(variable)
        self.variable = variable


def verificar_modelo(
    variable_ruta: str, variable_sha: str, ruta: Path | None, sha_esperado: str | None
) -> None:
    raise NotImplementedError
