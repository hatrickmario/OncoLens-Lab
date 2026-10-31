"""RN-23 en una opción que ya salió del flujo (descartada por sus citas): sus fragmentos prohibidos se reemplazan.

Reglas puras, sin E/S.
"""

from __future__ import annotations

from app.domain.atribucion import marco_de_atribucion, validar_forma_de_afirmacion
from app.domain.citations import OpcionGenerada
from app.domain.claims import PapelDeAfirmacion
from app.domain.soporte_por_papel import EstadoDeAfirmacion, estado_por_lenguaje_y_forma
from app.domain.support import (
    BuscadorDeTerminos,
    RetiroDeLenguaje,
    exigir_afirmaciones_atomicas,
    literal_de_retiro,
    literal_de_texto_no_mostrado,
    reglas_del_titulo,
)


def texto_a_mostrar(texto: str, estado: EstadoDeAfirmacion, idioma: str) -> str:
    """El texto de una afirmación solo sale si no incumple la lista ni llegó fuera de forma (RN-23); si no, un literal."""
    if estado is EstadoDeAfirmacion.lenguaje_no_permitido:
        return literal_de_retiro(idioma)
    if estado in (EstadoDeAfirmacion.modal_normativo, EstadoDeAfirmacion.fuera_de_forma):
        return literal_de_texto_no_mostrado(idioma)
    return texto


def opcion_descartada_visible(
    origen: OpcionGenerada, retirada: bool, principal_visible: str, idioma: str
) -> OpcionGenerada:
    """La opción descartada como se muestra (RN-23): el literal de retiro si su propio texto incumple, y como
    justificación el marco más la principal ya saneada. Única regla para la descartada por soporte y por citas."""
    return OpcionGenerada(
        literal_de_retiro(idioma) if retirada else origen.option,
        marco_de_atribucion(idioma) + principal_visible,
        origen.chunk_ids_citados,
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
    reglas_de_la_opcion = reglas_del_titulo(buscar_terminos, opcion.option)
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
    return opcion_descartada_visible(opcion, bool(reglas_de_la_opcion), visible, idioma), tuple(
        retiros
    )
