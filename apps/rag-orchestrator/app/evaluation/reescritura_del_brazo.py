"""Regla pura de la reescritura efectiva de una consulta frente a la de su brazo (US-277 AC-5): sin E/S ni adaptadores.

La reescritura es el segundo loop de RN-02 enmendada (US-238): solo corre con el primer loop vacío. Por eso, con el brazo
encendido, una consulta que terminó en ``sin_evidencia`` DEBE haber invocado al reescritor; con el brazo apagado, ninguna.
"""

from __future__ import annotations


def reescritura_efectiva_coincide(
    esperada: bool, invocaciones_de_la_consulta: int, termino_sin_evidencia: bool
) -> bool:
    if not esperada:
        return invocaciones_de_la_consulta == 0
    return invocaciones_de_la_consulta >= 1 or not termino_sin_evidencia
