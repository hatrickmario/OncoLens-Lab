"""Rechazo del JWT de servicio: el motivo es cerrado y solo va al log, nunca a la respuesta (sin oráculo)."""

from typing import Literal

MotivoTokenInvalido = Literal[
    "ausente", "malformado", "algoritmo", "firma", "emisor", "audiencia", "expirado", "vida_maxima"
]


class TokenServicioInvalido(Exception):
    """El JWT de servicio falta o no es válido."""

    def __init__(self, motivo: MotivoTokenInvalido) -> None:
        super().__init__(motivo)
        self.motivo = motivo
