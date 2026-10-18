"""Reglas puras sobre la identidad de los modelos locales (FR-25, IA-07)."""


def describir_modelo(modelo: str, revision: str, sha256: str) -> str:
    """``<modelo>@<revisión>#sha256:<hash>`` para ``meta.rerankerModel``, construido desde la configuración.

    El SHA-256 de procedencia es un identificador público del peso (no el hash de una verificación fallida).
    """
    if not (modelo and revision and sha256):
        raise ValueError("modelo, revisión y SHA-256 son obligatorios para describir un modelo")
    return f"{modelo}@{revision}#sha256:{sha256.lower()}"
