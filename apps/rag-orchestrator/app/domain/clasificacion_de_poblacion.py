"""Clasificación de la población del estudio en lista (US-243, ADR-47, DEC-11): reglas puras, sin E/S ni LLM.

Une los valores de los fragmentos que cita una opción, reconoce restricción y conflicto con las tablas del catálogo y proyecta
los estados internos a los cuatro de RN-28. No depende de ``applicability_rules``: es la hoja de la que esta toma la
clasificación (un solo sentido). Ninguna función produce un puntaje (RN-28)."""

import re
from collections.abc import Collection, Mapping, Sequence

from app.domain.aplicabilidad_tipos import (
    CriterioDePoblacion,
    EstadoInterno,
    MotivoInterno,
    ProyeccionDeEstado,
    ValorDePoblacion,
)
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad, DestinoDelCriterio

_ENTERO = re.compile(r"\d+")
_RANGO_DE_ENTEROS = re.compile(r"(\d+)\s*[-–]\s*(\d+)")
_PALABRA_DE_RANGO = re.compile(r"[-–]")


type _Clasificacion = tuple[EstadoInterno, MotivoInterno | None]


def es_forma_antigua(valores: Sequence[ValorDePoblacion]) -> bool:
    """Algún valor no trae fragmento: es la forma del S3, que se lee como antes (lectura doble de US-241, D6)."""
    return any(v.chunk_id is None for v in valores)


def valores_de_la_opcion(
    criterio: CriterioDePoblacion, chunk_ids_citados: Collection[str]
) -> tuple[ValorDePoblacion, ...]:
    """Los valores del criterio que entran en el cálculo de una opción: los de la lista cuyo ``chunkId`` cita la opción y
    los de la forma antigua, que describen el documento y no guardaron fragmento (D1). Ningún otro entra (AC-7)."""
    return tuple(
        v for v in criterio.valores if v.chunk_id is None or v.chunk_id in chunk_ids_citados
    )


def reconoce_restriccion(valor: str, marcadores: Collection[str]) -> bool:
    """El valor lleva un marcador de restricción explícita del catálogo (``solo``, ``only``…) como palabra completa."""
    patron = _patron_de_marcadores(marcadores)
    return patron is not None and patron.search(valor) is not None


def _patron_de_marcadores(marcadores: Collection[str]) -> re.Pattern[str] | None:
    if not marcadores:
        return None
    alternativas = "|".join(re.escape(m) for m in marcadores)
    return re.compile(rf"\b(?:{alternativas})\b", re.IGNORECASE)


def _sin_marcadores(valor: str, marcadores: Collection[str]) -> str:
    patron = _patron_de_marcadores(marcadores)
    sin_marcador = valor if patron is None else patron.sub("", valor)
    return " ".join(sin_marcador.split())


def detectar_conflicto(codigos_por_fragmento: Mapping[str, frozenset[str]]) -> bool:
    """Hay conflicto cuando dos fragmentos distintos nombran códigos del catálogo sin ninguno en común (excluyentes entre
    sí, DEC-11). Un fragmento sin código mapeado no cuenta: lo no mapeado queda ``no_mapeado`` (RN-27)."""
    conjuntos = [c for c in codigos_por_fragmento.values() if c]
    return any(
        conjuntos[i].isdisjoint(conjuntos[j])
        for i in range(len(conjuntos))
        for j in range(i + 1, len(conjuntos))
    )


def proyectar_estado(
    interno: EstadoInterno, motivo_interno: MotivoInterno | None = None
) -> ProyeccionDeEstado:
    """Los nueve estados internos a los cuatro de RN-28, con ``partialReason`` o causa (design D2)."""
    if interno == "sin_regla":
        return ProyeccionDeEstado(
            "desconocido", causa="sin_regla_de_comparacion", motivo_interno=motivo_interno
        )
    return _PROYECCION_DE_ESTADO_INTERNO[interno]


_PROYECCION_DE_ESTADO_INTERNO: Mapping[EstadoInterno, ProyeccionDeEstado] = {
    "exacto": ProyeccionDeEstado("coincide"),
    "inclusivo": ProyeccionDeEstado("parcial", motivo_parcial="inclusiva"),
    "mezclado": ProyeccionDeEstado("parcial", motivo_parcial="mezclada"),
    "rango_solapado": ProyeccionDeEstado("parcial", motivo_parcial="rango_solapado"),
    "solo_subgrupo": ProyeccionDeEstado("parcial", motivo_parcial="solo_subgrupo"),
    "restringido": ProyeccionDeEstado("no_coincide"),
    "en_conflicto": ProyeccionDeEstado("desconocido", causa="valores_en_conflicto"),
    "ausente": ProyeccionDeEstado("desconocido", causa="no_reportado_por_fuente"),
}


def clasificar_poblacion(
    valores: Sequence[ValorDePoblacion],
    valor_paciente: str,
    criterio: CriterioDeAplicabilidad,
    *,
    diseno_de_la_fuente: str | None = None,
) -> _Clasificacion:
    """Estado interno de la lista de una opción. ``subgrupo`` y ``mencion`` no cuentan (ADR-47): sin valores de
    elegibilidad el criterio queda ``ausente``."""
    elegibles = [v for v in valores if v.alcance == "elegibilidad"]
    if not elegibles:
        return "ausente", None
    if es_criterio_compuesto(criterio.destino):
        return "sin_regla", "forma_no_comparable"
    if criterio.regla.operador == "rango":
        return _clasificar_rango(valor_paciente, elegibles, criterio)
    return _clasificar_categorias(valor_paciente, elegibles, criterio, diseno_de_la_fuente)


def _clasificar_categorias(
    valor_paciente: str,
    elegibles: Sequence[ValorDePoblacion],
    criterio: CriterioDeAplicabilidad,
    diseno_de_la_fuente: str | None,
) -> _Clasificacion:
    por_fragmento = _codigos_por_fragmento(elegibles, criterio)
    codigos = frozenset().union(*por_fragmento.values())
    codigo_paciente = _codigo_del_paciente(valor_paciente, criterio)
    if not codigos or codigo_paciente is None:
        return "sin_regla", "valor_fuera_de_tabla"
    if detectar_conflicto(por_fragmento):
        return "en_conflicto", None
    if codigo_paciente not in codigos:
        marcadores = criterio.poblacion.marcadores_de_restriccion
        restringido = any(reconoce_restriccion(v.valor, marcadores) for v in elegibles)
        return ("restringido" if restringido else "ausente"), None
    if len(codigos) == 1:
        return "exacto", None
    mezcla = diseno_de_la_fuente in criterio.poblacion.disenos_que_mezclan
    return ("mezclado" if mezcla else "inclusivo"), None


def _codigos_por_fragmento(
    elegibles: Sequence[ValorDePoblacion], criterio: CriterioDeAplicabilidad
) -> dict[str, frozenset[str]]:
    por_fragmento: dict[str, set[str]] = {}
    for valor in elegibles:
        codigo = _codigo_del_estudio(valor.valor, criterio)
        if codigo is not None and valor.chunk_id is not None:
            por_fragmento.setdefault(valor.chunk_id, set()).add(codigo)
    return {chunk: frozenset(codigos) for chunk, codigos in por_fragmento.items()}


def _indice_de_sinonimos(criterio: CriterioDeAplicabilidad) -> dict[str, str]:
    return {
        texto.casefold(): codigo
        for codigo, textos in criterio.poblacion.sinonimos.items()
        for texto in textos
    }


def _codigo_del_estudio(valor: str, criterio: CriterioDeAplicabilidad) -> str | None:
    """Código del catálogo que nombra el valor del estudio, sin su marcador de restricción; ``None`` = ``no_mapeado``."""
    texto = _sin_marcadores(valor, criterio.poblacion.marcadores_de_restriccion)
    codigo = _indice_de_sinonimos(criterio).get(texto.casefold())
    if codigo is not None:
        return codigo
    return texto if texto in criterio.regla.equivalencias else None


def _codigo_del_paciente(valor: str, criterio: CriterioDeAplicabilidad) -> str | None:
    codigo = _indice_de_sinonimos(criterio).get(valor.casefold())
    return codigo or categoria_del_paciente(criterio.regla.equivalencias, valor)


def _clasificar_rango(
    valor_paciente: str, elegibles: Sequence[ValorDePoblacion], criterio: CriterioDeAplicabilidad
) -> _Clasificacion:
    if _ENTERO.fullmatch(valor_paciente):
        return _clasificar_rango_numerico(int(valor_paciente), elegibles, criterio)
    return _clasificar_rango_ordinal(valor_paciente, elegibles, criterio)


def _clasificar_rango_numerico(
    valor_paciente: int, elegibles: Sequence[ValorDePoblacion], criterio: CriterioDeAplicabilidad
) -> _Clasificacion:
    rangos = [rango_acotado(v.valor, criterio) for v in elegibles]
    if any(rango is None for rango in rangos):
        return "sin_regla", "forma_no_comparable"
    dentro = any(r is not None and r[0] <= valor_paciente <= r[1] for r in rangos)
    return ("exacto" if dentro else "restringido"), None


def _clasificar_rango_ordinal(
    valor_paciente: str, elegibles: Sequence[ValorDePoblacion], criterio: CriterioDeAplicabilidad
) -> _Clasificacion:
    """Rango sobre la escala ordenada del catálogo (estadio): sin escala no hay regla de comparación (design D3)."""
    reglas = criterio.poblacion
    if not reglas.escala:
        sin_escala = criterio.destino.campo == "stage_value"
        return "sin_regla", "sin_escala" if sin_escala else "forma_no_comparable"
    del_paciente = _tramo_de_la_escala(valor_paciente, reglas.escala, reglas.grupos)
    tramos = [_tramo_del_estudio(v.valor, reglas.escala, reglas.grupos) for v in elegibles]
    if del_paciente is None or any(tramo is None for tramo in tramos):
        return "sin_regla", "valor_fuera_de_tabla"
    cubierto = frozenset().union(*(t for t in tramos if t is not None))
    if del_paciente <= cubierto:
        return "exacto", None
    return ("rango_solapado" if del_paciente & cubierto else "restringido"), None


def _tramo_de_la_escala(
    valor: str, escala: tuple[str, ...], grupos: Mapping[str, tuple[str, ...]]
) -> frozenset[str] | None:
    if valor in escala:
        return frozenset({valor})
    return frozenset(grupos[valor]) if valor in grupos else None


def _tramo_del_estudio(
    texto: str, escala: tuple[str, ...], grupos: Mapping[str, tuple[str, ...]]
) -> frozenset[str] | None:
    """Los puntos de la escala que cubre «a», «a–b» o «a-b»; ``None`` si un extremo no está en la tabla."""
    extremos = [e.strip() for e in _PALABRA_DE_RANGO.split(texto)]
    if len(extremos) > 2 or not all(extremos):
        return None
    desde = _tramo_de_la_escala(extremos[0], escala, grupos)
    hasta = _tramo_de_la_escala(extremos[-1], escala, grupos)
    if desde is None or hasta is None:
        return None
    primero = min(escala.index(p) for p in desde)
    ultimo = max(escala.index(p) for p in hasta)
    return frozenset(escala[primero : ultimo + 1]) if primero <= ultimo else None


def es_criterio_compuesto(destino: DestinoDelCriterio) -> bool:
    """RE/RP, HRR/BRCA: el destino reúne varios biomarcadores (``match.name`` con lista). El paciente se rotula por
    componente y el estudio guarda una sola cadena, así que no hay componente contra componente que comparar."""
    return len(destino.coincidencia.get("name", ())) > 1


def categoria_del_paciente(
    equivalencias: Mapping[str, tuple[str, ...]], valor_paciente: str
) -> str | None:
    for categoria, alternativas in equivalencias.items():
        if any(valor_paciente.startswith(alternativa) for alternativa in alternativas):
            return categoria
    return None


def rango_acotado(texto: str, criterio: CriterioDeAplicabilidad) -> tuple[float, float] | None:
    """Rango ``a-b`` (guion o raya) o entero único, intersecado con ``rule.limits`` del catálogo."""
    par = _RANGO_DE_ENTEROS.fullmatch(texto)
    if par:
        minimo, maximo = int(par.group(1)), int(par.group(2))
    elif _ENTERO.fullmatch(texto):
        minimo = maximo = int(texto)
    else:
        return None
    limites = criterio.regla.limites
    if limites is not None and limites.minimo is not None:
        minimo = max(minimo, limites.minimo)
    if limites is not None and limites.maximo is not None:
        maximo = min(maximo, limites.maximo)
    return minimo, maximo
