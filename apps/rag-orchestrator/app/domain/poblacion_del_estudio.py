"""Lector doble de ``population_criteria`` (ADR-47, US-241, design D4–D6): reglas puras, sin E/S.

Entrega al dominio, por criterio, una lista de valores desde las dos formas que conviven un sprint:

- **antigua** (S3): una cadena con texto, ``{"valor", "alcance"}`` o, para los biomarcadores, un objeto de una cadena por
  subclave (``{"biomarcadores": {"her2": "positivo"}}`` → clave ``biomarcadores.her2``). La proyección es una lista de un
  elemento sin ``chunk_id``; el ``alcance`` ``subgrupo`` se conserva y cualquier otro es ``elegibilidad``.
- **nueva** (S4): una lista de ``{value, chunkId, scope, …}`` por criterio, o ``{"status", "values"}``; la marca
  ``{"status": "pendiente", "values": []}`` (D5) es un criterio pendiente válido, sin lista.

Una forma nueva inválida (más de ``max_valores`` de un mismo fragmento, ``scope`` fuera del enum, valor vacío) degrada
el criterio a «sin valor» y deja su motivo en ``invalidez``; nunca lanza, nunca copia el valor y no inventa uno (RN-26).
"""

from collections.abc import Iterator, Mapping, Sequence

from app.domain.aplicabilidad_tipos import (
    ALCANCES,
    AlcanceDeValor,
    CriterioDePoblacion,
    FormaInvalida,
    OrigenDeMetadatos,
    PoblacionDelEstudio,
    ValorDePoblacion,
)

VALOR_NO_DISPONIBLE = "no_disponible"
ALCANCE_ANTIGUO_DE_SUBGRUPO = "subgrupo"
ESTADO_PENDIENTE = "pendiente"


def poblacion_desde_lo_guardado(
    metadata_source: OrigenDeMetadatos, guardado: Mapping[str, object], max_valores: int
) -> PoblacionDelEstudio:
    """``population_criteria`` tal como está guardado → un ``CriterioDePoblacion`` por clave de estudio."""
    criterios = {
        clave: leer_criterio_guardado(valor, max_valores)
        for clave, valor in _hojas_por_clave_de_estudio(guardado)
    }
    return PoblacionDelEstudio(metadata_source, criterios)


def leer_criterio_guardado(guardado: object, max_valores: int) -> CriterioDePoblacion:
    """La lista de valores de un criterio, venga de la forma antigua o de la nueva."""
    if isinstance(guardado, str):
        return _de_forma_antigua(guardado, "elegibilidad")
    if isinstance(guardado, Sequence):
        return _de_lista_nueva(guardado, max_valores)
    if isinstance(guardado, Mapping) and "values" in guardado:
        return _de_objeto_nuevo(guardado, max_valores)
    if isinstance(guardado, Mapping) and isinstance(guardado.get("valor"), str):
        subgrupo = guardado.get("alcance") == ALCANCE_ANTIGUO_DE_SUBGRUPO
        return _de_forma_antigua(guardado["valor"], "subgrupo" if subgrupo else "elegibilidad")
    return CriterioDePoblacion()


def _hojas_por_clave_de_estudio(guardado: Mapping[str, object]) -> Iterator[tuple[str, object]]:
    """Cada criterio con su clave de estudio: ``a`` o ``a.b`` cuando la forma antigua anida una cadena por subclave."""
    for clave, valor in guardado.items():
        if _es_un_criterio(valor) or not isinstance(valor, Mapping):
            yield clave, valor
        else:
            for subclave, subvalor in valor.items():
                yield f"{clave}.{subclave}", subvalor


def _es_un_criterio(valor: object) -> bool:
    if isinstance(valor, Mapping):
        return "valor" in valor or "values" in valor
    return True


def _de_forma_antigua(texto: str, alcance: AlcanceDeValor) -> CriterioDePoblacion:
    if not texto or texto == VALOR_NO_DISPONIBLE:
        return CriterioDePoblacion()
    return CriterioDePoblacion((ValorDePoblacion(texto, alcance, None),))


def _de_objeto_nuevo(objeto: Mapping[str, object], max_valores: int) -> CriterioDePoblacion:
    valores = objeto["values"]
    estado = objeto.get("status")
    if not isinstance(valores, Sequence) or isinstance(valores, str):
        return _invalido("valor_invalido", None)
    if estado is None:
        return _de_lista_nueva(valores, max_valores)
    if estado == ESTADO_PENDIENTE and not valores:
        return CriterioDePoblacion(pendiente=True)
    return _invalido("valor_invalido", None)


def _de_lista_nueva(elementos: Sequence[object], max_valores: int) -> CriterioDePoblacion:
    valores: list[ValorDePoblacion] = []
    for elemento in elementos:
        leido = _leer_valor_nuevo(elemento)
        if isinstance(leido, FormaInvalida):
            return CriterioDePoblacion(invalidez=leido)
        valores.append(leido)
    for chunk_id in dict.fromkeys(v.chunk_id for v in valores):
        if sum(1 for v in valores if v.chunk_id == chunk_id) > max_valores:
            return _invalido("demasiados_valores", chunk_id)
    return CriterioDePoblacion(tuple(valores))


def _leer_valor_nuevo(elemento: object) -> ValorDePoblacion | FormaInvalida:
    if not isinstance(elemento, Mapping):
        return FormaInvalida("valor_invalido", None)
    chunk_id = elemento.get("chunkId")
    chunk_citable = chunk_id if isinstance(chunk_id, str) and chunk_id else None
    valor, alcance = elemento.get("value"), elemento.get("scope")
    if not isinstance(valor, str) or not valor or chunk_citable is None:
        return FormaInvalida("valor_invalido", chunk_citable)
    if alcance not in ALCANCES:
        return FormaInvalida("alcance_fuera_de_enum", chunk_citable)
    return ValorDePoblacion(valor, alcance, chunk_citable)


def _invalido(motivo: str, chunk_id: str | None) -> CriterioDePoblacion:
    return CriterioDePoblacion(invalidez=FormaInvalida(motivo, chunk_id))  # type: ignore[arg-type]
