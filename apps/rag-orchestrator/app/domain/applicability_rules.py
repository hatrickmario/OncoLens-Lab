"""Reglas puras de la aplicabilidad por criterio (FR-25, RN-25, RN-28, ADR-34 b, L1D-127): sin E/S, sin LLM.

Las reglas son datos del catálogo (``rule.operator``, ``equivalences``, ``limits``, ``partial.when``), nunca código por
criterio (RN-22, US-121 AC-5). Los valores del paciente y del estudio se copian sin normalizar; la comparación es por
prefijo o elemento exacto, sensible a mayúsculas y espacios (design D2b). Lo que no se puede comparar queda
``desconocido`` y se registra su motivo interno: nunca se adivina. Ninguna función produce un puntaje (RN-28).
"""

import re
from collections.abc import Callable, Collection, Iterable, Mapping, Sequence
from dataclasses import replace

from app.domain.aplicabilidad_tipos import (
    AtributoDelPaciente,
    AvisoDelDato,
    CausaDeDesconocido,
    MOTIVOS_SIN_REGLA_DE_COMPARACION,
    ContextoDelPaciente,
    CriterioDePoblacion,
    CriterioEvaluado,
    DatoDelPaciente,
    EstadoDeCriterio,
    EstadoInterno,
    MotivoInterno,
    PoblacionDelEstudio,
    ProcedenciaDelDato,
    ProyeccionDeEstado,
    ResumenDeEstados,
    TratamientoPrevioDelPaciente,
    ValorDelEstudio,
    ValorDePoblacion,
)
from app.domain.applicability_order import contar_excluyentes_no_coincide
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad, DestinoDelCriterio

_SEPARADORES_DE_LISTA = re.compile(r"[,;]")
_ENTERO = re.compile(r"\d+")
_RANGO_DE_ENTEROS = re.compile(r"(\d+)\s*[-–]\s*(\d+)")
_ELEMENTO_CON_FORMA_DE_RANGO = re.compile(
    r"(\d+|[IVX]+[A-C]?)\s*[-–]\s*(\d+|[IVX]+[A-C]?)"
)  # «1-2», «I–III»: un rango no es una lista de valores


class DestinoNoResoluble(Exception):
    """El ``destination`` del catálogo no es uno de los que sabe leer el resolvedor (design D3)."""


# --- valor del estudio (RN-25, design D4) ------------------------------------------------------------------------


def valor_del_estudio(
    poblacion: PoblacionDelEstudio, clave_de_estudio: str
) -> ValorDelEstudio | None:
    """Copia literal del valor bajo ``studyKey`` (clave ``a`` o subclave ``a.b``), o ``None`` sin inferir.

    Todos los valores del criterio, sin distinguir fragmentos: es la lectura de la forma antigua y del documento. La
    de una opción filtra antes por los fragmentos que cita (``valores_de_la_opcion``)."""
    criterio = poblacion.criterios.get(clave_de_estudio)
    return None if criterio is None else _valor_de_forma_antigua(criterio.valores)


def _valor_de_forma_antigua(valores: Sequence[ValorDePoblacion]) -> ValorDelEstudio | None:
    """Del criterio, el primer valor de elegibilidad; si solo hay de subgrupo, el primero de ellos marcado
    ``solo_subgrupo`` (Q2); los de mención no cuentan (ADR-47). Sin valores: ``None``."""
    elegibles = [v for v in valores if v.alcance == "elegibilidad"]
    if elegibles:
        return ValorDelEstudio(elegibles[0].valor, solo_subgrupo=False)
    subgrupos = [v for v in valores if v.alcance == "subgrupo"]
    return ValorDelEstudio(subgrupos[0].valor, solo_subgrupo=True) if subgrupos else None


# --- estado por criterio con la población en lista (US-243, ADR-47) ------------------------------------------------

DISENOS_QUE_MEZCLAN_POBLACIONES = frozenset({"guia", "revision_sistematica"})
"""``study_design`` cuyos fragmentos suelen reunir varias poblaciones sin desagregar (DEC-11, ``mezclada``)."""

_PALABRA_DE_RANGO = re.compile(r"[-–]")

type _Clasificacion = tuple[EstadoInterno, MotivoInterno | None]


def fuente_mezcla_poblaciones(study_design: str | None) -> bool:
    return study_design in DISENOS_QUE_MEZCLAN_POBLACIONES


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


def estado_de_poblacion(
    valores: Sequence[ValorDePoblacion],
    valor_paciente: str | None,
    criterio: CriterioDeAplicabilidad,
    *,
    fuente_mezcla: bool = False,
) -> ProyeccionDeEstado:
    """Estado visible, ``partialReason`` y causa de un criterio a partir de los valores de los fragmentos que cita la
    opción y del valor del paciente (RN-28). Función pura: sin E/S, sin LLM, sin puntaje.

    Un valor sin ``chunk_id`` es de la forma antigua y se lee como en el S3 (D6): lectura doble durante un sprint."""
    if valor_paciente is None:
        return ProyeccionDeEstado("desconocido", causa="falta_en_paciente")
    if any(v.chunk_id is None for v in valores):
        return _proyeccion_de_forma_antigua(
            criterio, valor_paciente, _valor_de_forma_antigua(valores)
        )
    interno, motivo = clasificar_poblacion(
        valores, valor_paciente, criterio, fuente_mezcla=fuente_mezcla
    )
    return proyectar_estado(interno, motivo)


def clasificar_poblacion(
    valores: Sequence[ValorDePoblacion],
    valor_paciente: str,
    criterio: CriterioDeAplicabilidad,
    *,
    fuente_mezcla: bool = False,
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
    return _clasificar_categorias(valor_paciente, elegibles, criterio, fuente_mezcla)


def _clasificar_categorias(
    valor_paciente: str,
    elegibles: Sequence[ValorDePoblacion],
    criterio: CriterioDeAplicabilidad,
    fuente_mezcla: bool,
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
    return ("mezclado" if fuente_mezcla else "inclusivo"), None


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
    return codigo or _categoria_del_paciente(criterio.regla.equivalencias, valor)


def _clasificar_rango(
    valor_paciente: str, elegibles: Sequence[ValorDePoblacion], criterio: CriterioDeAplicabilidad
) -> _Clasificacion:
    if _ENTERO.fullmatch(valor_paciente):
        return _clasificar_rango_numerico(int(valor_paciente), elegibles, criterio)
    return _clasificar_rango_ordinal(valor_paciente, elegibles, criterio)


def _clasificar_rango_numerico(
    valor_paciente: int, elegibles: Sequence[ValorDePoblacion], criterio: CriterioDeAplicabilidad
) -> _Clasificacion:
    rangos = [_rango_acotado(v.valor, criterio) for v in elegibles]
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


# --- valor del paciente (ADR-34 b, design D3) --------------------------------------------------------------------


def valor_del_paciente(contexto: ContextoDelPaciente, destino: DestinoDelCriterio) -> str | None:
    """Copia literal del dato del paciente que indica el ``destination`` del catálogo, o ``None`` si falta.

    Con varios valores del mismo destino gana el de menor ``monthsAgo`` y, a igualdad, el primero de la petición.
    ``DestinoNoResoluble`` si el destino no es uno de los conocidos: ``None`` no puede significar dos cosas."""
    dato = dato_del_paciente(contexto, destino)
    return None if dato is None else dato.valor


def dato_del_paciente(
    contexto: ContextoDelPaciente, destino: DestinoDelCriterio
) -> DatoDelPaciente | None:
    """El valor de ``valor_del_paciente`` con la procedencia del dato del que se copió (RN-07, US-124)."""
    lector = _LECTORES_DE_DESTINO.get((destino.entidad, destino.campo))
    if lector is None:
        raise DestinoNoResoluble(f"{destino.entidad}.{destino.campo}")
    return lector(contexto, destino)


def es_criterio_compuesto(destino: DestinoDelCriterio) -> bool:
    """RE/RP, HRR/BRCA: el destino reúne varios biomarcadores (``match.name`` con lista). El paciente se rotula por
    componente y el estudio guarda una sola cadena, así que no hay componente contra componente que comparar."""
    return len(destino.coincidencia.get("name", ())) > 1


def _nombres_exigidos(coincidencia: Mapping[str, tuple[str, ...]]) -> tuple[str, ...]:
    nombres = coincidencia.get("name")
    if not nombres:
        raise DestinoNoResoluble("Biomarker sin match.name")
    return nombres


def _dato_de_biomarcador(contexto: ContextoDelPaciente, nombre: str) -> DatoDelPaciente | None:
    biomarcadores = (b for b in contexto.biomarcadores if b.nombre == nombre)
    return _el_mas_reciente(
        biomarcadores, lambda b: b.meses_atras, lambda b: DatoDelPaciente(b.valor, (b.procedencia,))
    )


def _leer_biomarcador(
    contexto: ContextoDelPaciente, destino: DestinoDelCriterio
) -> DatoDelPaciente | None:
    nombres = _nombres_exigidos(destino.coincidencia)
    datos = [_dato_de_biomarcador(contexto, nombre) for nombre in nombres]
    if not es_criterio_compuesto(destino):
        return datos[0]
    componentes = [(nombre, dato) for nombre, dato in zip(nombres, datos) if dato is not None]
    if len(componentes) < len(nombres):
        return None
    return DatoDelPaciente(
        "; ".join(f"{nombre}: {dato.valor}" for nombre, dato in componentes),
        tuple(p for _, dato in componentes for p in dato.procedencias),
    )


def _del_diagnostico(contexto: ContextoDelPaciente, valor: str | None) -> DatoDelPaciente | None:
    """Estadio, grado y desempeño se copian del diagnóstico y comparten su procedencia."""
    if valor is None:
        return None
    return DatoDelPaciente(valor, (contexto.procedencia_del_diagnostico,))


def _leer_desempeno(
    contexto: ContextoDelPaciente, destino: DestinoDelCriterio
) -> DatoDelPaciente | None:
    escala = destino.coincidencia.get("performance_scale")
    if not escala:
        raise DestinoNoResoluble("performance_value sin match.performance_scale")
    if contexto.escala_de_desempeno not in escala or contexto.valor_de_desempeno is None:
        return None
    return _del_diagnostico(contexto, str(contexto.valor_de_desempeno))


def _leer_atributo(
    contexto: ContextoDelPaciente, destino: DestinoDelCriterio
) -> DatoDelPaciente | None:
    claves = destino.coincidencia.get("attribute_key")
    if not claves:
        raise DestinoNoResoluble("ClinicalAttribute sin match.attribute_key")
    atributos = (a for a in contexto.atributos if a.clave in claves)
    return _el_mas_reciente(
        atributos, _meses_de_atributo, lambda a: DatoDelPaciente(a.valor, (a.procedencia,))
    )


def _leer_linea(
    contexto: ContextoDelPaciente, destino: DestinoDelCriterio
) -> DatoDelPaciente | None:
    con_numero = (t for t in contexto.tratamientos_previos if t.numero_de_linea is not None)
    return _el_mas_reciente(
        con_numero,
        _meses_de_tratamiento,
        lambda t: DatoDelPaciente(str(t.numero_de_linea), (t.procedencia,)),
    )


def _meses_de_atributo(atributo: AtributoDelPaciente) -> int:
    return _SIN_FECHA if atributo.meses_atras is None else atributo.meses_atras


def _meses_de_tratamiento(tratamiento: TratamientoPrevioDelPaciente) -> int:
    inicio = tratamiento.meses_desde_el_inicio
    return _SIN_FECHA if inicio is None else inicio


_SIN_FECHA = 10**9
"""Un valor sin fecha pierde frente a cualquiera con fecha; entre iguales gana el primero de la petición."""

type _Lector = Callable[[ContextoDelPaciente, DestinoDelCriterio], DatoDelPaciente | None]

_LECTORES_DE_DESTINO: Mapping[tuple[str, str | None], _Lector] = {
    ("Biomarker", "value"): _leer_biomarcador,
    ("Diagnosis", "stage_value"): lambda contexto, _: _del_diagnostico(
        contexto, contexto.valor_de_estadio
    ),
    ("Diagnosis", "grade"): lambda contexto, _: _del_diagnostico(contexto, contexto.grado),
    ("Diagnosis", "performance_value"): _leer_desempeno,
    ("ClinicalAttribute", "value"): _leer_atributo,
    ("PriorTreatment", "line_number"): _leer_linea,
}


def _el_mas_reciente[T](
    candidatos: Iterable[T],
    meses_atras: Callable[[T], int],
    dato: Callable[[T], DatoDelPaciente],
) -> DatoDelPaciente | None:
    """El dato del candidato con menos meses de antigüedad; ``min`` conserva el primero ante un empate."""
    elegido = min(candidatos, key=meses_atras, default=None)
    return None if elegido is None else dato(elegido)


# --- evaluación de un criterio (FR-25, design D2 y D2b) ------------------------------------------------------------


type _Veredicto = tuple[EstadoDeCriterio, MotivoInterno | None]


def evaluar_criterio(
    criterio: CriterioDeAplicabilidad,
    valor_paciente: str | None,
    valor_estudio: ValorDelEstudio | None,
) -> CriterioEvaluado:
    """Estado del criterio con la ``rule`` del catálogo. Precedencia de la causa: ``falta_en_paciente`` gana a
    ``no_reportado_por_fuente`` (D5); un valor presente pero sin regla de comparación es ``desconocido`` con
    ``sin_regla_de_comparacion`` (US-243)."""
    proyeccion = _proyeccion_de_forma_antigua(criterio, valor_paciente, valor_estudio)
    return CriterioEvaluado(
        criterio.clave,
        valor_paciente,
        valor_estudio.valor if valor_estudio else None,
        proyeccion.estado,
        proyeccion.causa,
        criterio.es_excluyente,
        proyeccion.motivo_interno,
        motivo_parcial=proyeccion.motivo_parcial,
    )


def _proyeccion_de_forma_antigua(
    criterio: CriterioDeAplicabilidad,
    valor_paciente: str | None,
    valor_estudio: ValorDelEstudio | None,
) -> ProyeccionDeEstado:
    causa = causa_de_desconocido(valor_paciente, valor_estudio)
    if causa is not None or valor_paciente is None or valor_estudio is None:
        return ProyeccionDeEstado("desconocido", causa=causa)
    estado, motivo = _veredicto(criterio, valor_paciente, valor_estudio)
    if estado == "desconocido" and motivo in MOTIVOS_SIN_REGLA_DE_COMPARACION:
        return proyectar_estado("sin_regla", motivo)
    if estado == "parcial":
        return proyectar_estado("solo_subgrupo")
    return ProyeccionDeEstado(estado, motivo_interno=motivo)


def causa_de_desconocido(
    valor_paciente: str | None, valor_estudio: ValorDelEstudio | None
) -> CausaDeDesconocido | None:
    """Por qué falta uno de los dos valores (FR-25): ``falta_en_paciente`` gana a ``no_reportado_por_fuente`` si faltan
    ambos (D2, ``[S3 resp. 16]``); con ambos presentes no hay causa, aunque el criterio acabe ``desconocido``."""
    if valor_paciente is None:
        return "falta_en_paciente"
    if valor_estudio is None:
        return "no_reportado_por_fuente"
    return None


def aviso_dato_paciente(procedencias: Sequence[ProcedenciaDelDato]) -> AvisoDelDato | None:
    """Aviso del dato del paciente que se comparó (RN-26, RN-07): sin datos es ``faltante``; con datos, el conflicto
    precede al «sin verificar» (D3), como ``etiqueta_de_procedencia`` del prompt. Nunca altera el estado ni bloquea."""
    if not procedencias:
        return "faltante"
    if any(p.en_conflicto for p in procedencias):
        return "en_conflicto"
    if any(p.requiere_revision for p in procedencias):
        return "sin_verificar"
    return None


def _desconocido(
    criterio: CriterioDeAplicabilidad,
    valor_paciente: str | None,
    valor_estudio: str | None,
    *,
    causa: CausaDeDesconocido | None = None,
    motivo: MotivoInterno | None = None,
) -> CriterioEvaluado:
    return CriterioEvaluado(
        criterio.clave,
        valor_paciente,
        valor_estudio,
        "desconocido",
        causa,
        criterio.es_excluyente,
        motivo,
    )


def _veredicto(
    criterio: CriterioDeAplicabilidad, valor_paciente: str, valor_estudio: ValorDelEstudio
) -> _Veredicto:
    if es_criterio_compuesto(criterio.destino):
        return "desconocido", "forma_no_comparable"
    regla = criterio.regla
    if regla.operador == "igualdad":
        return _por_igualdad(regla.equivalencias, valor_paciente, valor_estudio.valor)
    if regla.operador == "rango":
        return _por_rango(criterio, valor_paciente, valor_estudio)
    return _por_pertenencia(criterio, valor_paciente, valor_estudio)


def _por_igualdad(
    equivalencias: Mapping[str, tuple[str, ...]], valor_paciente: str, valor_estudio: str
) -> _Veredicto:
    """Categoría del paciente = clave de ``equivalences`` cuya alternativa es prefijo de su valor. Sin categoría no se
    adivina: igual al literal coincide, igual a una clave de la tabla es ``desconocido``, otro valor no coincide."""
    categoria = _categoria_del_paciente(equivalencias, valor_paciente)
    if categoria is not None:
        return ("coincide" if valor_estudio == categoria else "no_coincide"), None
    if valor_estudio == valor_paciente:
        return "coincide", None
    if valor_estudio in equivalencias:
        return "desconocido", "valor_fuera_de_tabla"
    return "no_coincide", None


def _categoria_del_paciente(
    equivalencias: Mapping[str, tuple[str, ...]], valor_paciente: str
) -> str | None:
    for categoria, alternativas in equivalencias.items():
        if any(valor_paciente.startswith(alternativa) for alternativa in alternativas):
            return categoria
    return None


def _por_rango(
    criterio: CriterioDeAplicabilidad, valor_paciente: str, valor_estudio: ValorDelEstudio
) -> _Veredicto:
    if not _ENTERO.fullmatch(valor_paciente):
        # El estadio («IIA») no tiene escala ordenada en el catálogo: fuera del alcance del S3 (D2b).
        sin_escala = criterio.destino.campo == "stage_value"
        return "desconocido", "sin_escala" if sin_escala else "forma_no_comparable"
    rango = _rango_acotado(valor_estudio.valor, criterio)
    if rango is None:
        return "desconocido", "forma_no_comparable"
    minimo, maximo = rango
    if not minimo <= int(valor_paciente) <= maximo:
        return "no_coincide", None
    return _dentro(criterio, valor_estudio), None


def _rango_acotado(texto: str, criterio: CriterioDeAplicabilidad) -> tuple[float, float] | None:
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


def _por_pertenencia(
    criterio: CriterioDeAplicabilidad, valor_paciente: str, valor_estudio: ValorDelEstudio
) -> _Veredicto:
    elementos = [e.strip() for e in _SEPARADORES_DE_LISTA.split(valor_estudio.valor)]
    if any(_ELEMENTO_CON_FORMA_DE_RANGO.fullmatch(e) for e in elementos):
        return "desconocido", "forma_no_comparable"
    if valor_paciente not in elementos:
        return "no_coincide", None
    return _dentro(criterio, valor_estudio), None


def _dentro(criterio: CriterioDeAplicabilidad, valor_estudio: ValorDelEstudio) -> EstadoDeCriterio:
    """El paciente cae dentro del valor del estudio: ``parcial`` solo si el estudio lo reporta para un subgrupo y el
    criterio declara ``solo_subgrupo``. ``rango_solapado`` nunca produce ``parcial`` en el S3 (un valor puntual no
    solapa a medias)."""
    solo_subgrupo = criterio.regla.parcial_cuando == "solo_subgrupo" and valor_estudio.solo_subgrupo
    return "parcial" if solo_subgrupo else "coincide"


# --- evaluación de una fuente (composición) ------------------------------------------------------------------------


def evaluar_criterio_de_fuente(
    criterio: CriterioDeAplicabilidad,
    contexto: ContextoDelPaciente,
    poblacion: PoblacionDelEstudio,
    chunk_ids_citados: Collection[str] | None = None,
    *,
    fuente_mezcla: bool = False,
) -> CriterioEvaluado:
    """Lee el valor del paciente por ``destination`` y los del estudio por ``studyKey`` (los de los fragmentos citados,
    o todos si ``chunk_ids_citados`` es ``None``), evalúa el criterio y le añade el aviso del dato del paciente (US-124)."""
    try:
        dato = _dato_comparable(contexto, criterio)
    except DestinoNoResoluble:
        return _desconocido(criterio, None, None, motivo="destino_no_resoluble")
    valor_paciente = None if dato is None else dato.valor
    valores = _valores_del_criterio(poblacion, criterio, chunk_ids_citados)
    if any(v.chunk_id is not None for v in valores):
        evaluado = _evaluar_con_lista(criterio, valor_paciente, valores, fuente_mezcla)
    else:
        evaluado = evaluar_criterio(criterio, valor_paciente, _valor_de_forma_antigua(valores))
    return replace(evaluado, aviso=aviso_dato_paciente(() if dato is None else dato.procedencias))


def _valores_del_criterio(
    poblacion: PoblacionDelEstudio,
    criterio: CriterioDeAplicabilidad,
    chunk_ids_citados: Collection[str] | None,
) -> tuple[ValorDePoblacion, ...]:
    del_estudio = poblacion.criterios.get(criterio.clave_de_estudio)
    if del_estudio is None:
        return ()
    if chunk_ids_citados is None:
        return del_estudio.valores
    return valores_de_la_opcion(del_estudio, chunk_ids_citados)


def _evaluar_con_lista(
    criterio: CriterioDeAplicabilidad,
    valor_paciente: str | None,
    valores: tuple[ValorDePoblacion, ...],
    fuente_mezcla: bool,
) -> CriterioEvaluado:
    proyeccion = estado_de_poblacion(valores, valor_paciente, criterio, fuente_mezcla=fuente_mezcla)
    primero = next((v.valor for v in valores if v.alcance == "elegibilidad"), None)
    return CriterioEvaluado(
        criterio.clave,
        valor_paciente,
        primero,
        proyeccion.estado,
        proyeccion.causa,
        criterio.es_excluyente,
        proyeccion.motivo_interno,
        motivo_parcial=proyeccion.motivo_parcial,
        valores_del_estudio=valores,
    )


def _dato_comparable(
    contexto: ContextoDelPaciente, criterio: CriterioDeAplicabilidad
) -> DatoDelPaciente | None:
    """El dato del paciente que se compara; ``None`` si no existe o si el checklist declara que falta (D2): no se
    compara un valor que el propio contexto desmiente."""
    dato = dato_del_paciente(contexto, criterio.destino)
    return None if criterio.clave in contexto.datos_criticos_faltantes else dato


# --- conteos y población no comparable (RN-28) ---------------------------------------------------------------------


def contar_estados(criterios: Sequence[CriterioEvaluado]) -> ResumenDeEstados:
    """Cuántos criterios hay en cada estado; sin puntaje ni ponderación (RN-28)."""

    def cuantos(estado: EstadoDeCriterio) -> int:
        return sum(1 for c in criterios if c.estado == estado)

    return ResumenDeEstados(
        cuantos("coincide"), cuantos("parcial"), cuantos("no_coincide"), cuantos("desconocido")
    )


def poblacion_no_comparable(criterios: Sequence[CriterioEvaluado]) -> bool:
    """Un criterio excluyente en ``no_coincide`` hace la población no comparable (base de RN-28)."""
    return contar_excluyentes_no_coincide(criterios) > 0
