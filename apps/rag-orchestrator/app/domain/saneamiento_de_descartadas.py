"""RN-23 en una opción que ya salió del flujo (descartada por sus citas): sus fragmentos prohibidos se reemplazan.

Reglas puras, sin E/S.
"""

from __future__ import annotations

from app.domain.atribucion import marco_de_atribucion, validar_forma_de_afirmacion
from app.domain.citations import OpcionGenerada
from app.domain.claims import PapelDeAfirmacion
from app.domain.resolucion_de_soporte import texto_a_mostrar
from app.domain.soporte_por_papel import estado_por_lenguaje_y_forma
from app.domain.support import (
    BuscadorDeTerminos,
    RetiroDeLenguaje,
    exigir_afirmaciones_atomicas,
    literal_de_retiro,
)


def retirar_texto_prohibido(
    opcion: OpcionGenerada,
    buscar_terminos: BuscadorDeTerminos,
    idioma: str,
    max_palabras: int,
) -> tuple[OpcionGenerada, tuple[RetiroDeLenguaje, ...]]:
    """La justificación de la descartada es el marco más la principal, y una principal prohibida o fuera de forma nunca
    se expone (se sustituye por el literal de retiro o por «(texto no mostrado)»)."""
    exigir_afirmaciones_atomicas(opcion)
    retiros: list[RetiroDeLenguaje] = []
    reglas_de_la_opcion = tuple(buscar_terminos(opcion.option, "option"))
    if reglas_de_la_opcion:
        retiros.append(RetiroDeLenguaje("option", reglas_de_la_opcion))
    principal = next(a for a in opcion.afirmaciones if a.papel is PapelDeAfirmacion.principal)
    reglas = tuple(buscar_terminos(principal.texto, "rationale"))
    if reglas:
        retiros.append(RetiroDeLenguaje("rationale", reglas, PapelDeAfirmacion.principal))
    estado = estado_por_lenguaje_y_forma(
        reglas, validar_forma_de_afirmacion(principal.texto, max_palabras)
    )
    visible = texto_a_mostrar(principal.texto, estado, idioma)
    return (
        OpcionGenerada(
            literal_de_retiro(idioma) if reglas_de_la_opcion else opcion.option,
            marco_de_atribucion(idioma) + visible,
            opcion.chunk_ids_citados,
        ),
        tuple(retiros),
    )
