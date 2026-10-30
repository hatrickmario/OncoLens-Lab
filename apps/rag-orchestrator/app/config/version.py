"""Versión del servicio que expone `/health` (``serviceVersion``): la misma de ``info.version`` de su openapi.yaml.

Un test compara ambas; subir el contrato obliga a subir esta constante.
"""

VERSION_DEL_SERVICIO = "1.6.0"
