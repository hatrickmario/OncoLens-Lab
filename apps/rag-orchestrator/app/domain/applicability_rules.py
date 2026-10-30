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
    CriterioEvaluado,
    DatoDelPaciente,
    EstadoDeCriterio,
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
from app.domain.clasificacion_de_poblacion import (
    categoria_del_paciente,
    clasificar_poblacion,
    es_criterio_compuesto,
    es_forma_antigua,
    proyectar_estado,
    rango_acotado,
    valores_de_la_opcion,
)
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad, DestinoDelCriterio

_SEPARADORES_DE_LISTA = re.compile(r"[,;]")
_ENTERO = re.compile(r"\d+")
_ELEMENTO_CON_FORMA_DE_RANGO = re.compile(
    r"(\d+|[IVX]+[A-C]?)\s*[-–]\s*(\d+|[IVX]+[A-C]?)"
)  # «1-2», «I–III»: un rango no es una lista de valores


class DestinoNoResoluble(Exception):
    """El ``destination`` del catálogo no es uno de los que sabe leer el resolvedor (design D3)."""


# --- valor del estudio (RN-25, design D4) ------------------------------------------------------------------------


def valor_de_forma_antigua(valores: Sequence[ValorDePoblacion]) -> ValorDelEstudio | None:
    """Del criterio, el primer valor de elegibilidad; si solo hay de subgrupo, el primero de ellos marcado
    ``solo_subgrupo`` (Q2); los de mención no cuentan (ADR-47). Sin valores: ``None``."""
    elegibles = [v for v in valores if v.alcance == "elegibilidad"]
    if elegibles:
        return ValorDelEstudio(elegibles[0].valor, solo_subgrupo=False)
    subgrupos = [v for v in valores if v.alcance == "subgrupo"]
    return ValorDelEstudio(subgrupos[0].valor, solo_subgrupo=True) if subgrupos else None


# --- estado por criterio con la población en lista (US-243, ADR-47) ------------------------------------------------


def estado_de_poblacion(
    valores: Sequence[ValorDePoblacion],
    valor_paciente: str | None,
    criterio: CriterioDeAplicabilidad,
    *,
    diseno_de_la_fuente: str | None = None,
) -> ProyeccionDeEstado:
    """Estado visible, ``partialReason`` y causa de un criterio a partir de los valores de los fragmentos que cita la
    opción y del valor del paciente (RN-28). Función pura: sin E/S, sin LLM, sin puntaje.

    Un valor sin ``chunk_id`` es de la forma antigua y se lee como en el S3 (D6): lectura doble durante un sprint."""
    if valor_paciente is None:
        return ProyeccionDeEstado("desconocido", causa="falta_en_paciente")
    if es_forma_antigua(valores):
        return _proyeccion_de_forma_antigua(
            criterio, valor_paciente, valor_de_forma_antigua(valores)
        )
    interno, motivo = clasificar_poblacion(
        valores, valor_paciente, criterio, diseno_de_la_fuente=diseno_de_la_fuente
    )
    return proyectar_estado(interno, motivo)


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
    copiado = valor_estudio.valor if valor_estudio else None
    return _criterio_evaluado(criterio, valor_paciente, copiado, proyeccion)


def _criterio_evaluado(
    criterio: CriterioDeAplicabilidad,
    valor_paciente: str | None,
    valor_estudio: str | None,
    proyeccion: ProyeccionDeEstado,
    valores_del_estudio: tuple[ValorDePoblacion, ...] = (),
) -> CriterioEvaluado:
    return CriterioEvaluado(
        criterio.clave,
        valor_paciente,
        valor_estudio,
        proyeccion.estado,
        proyeccion.causa,
        criterio.es_excluyente,
        proyeccion.motivo_interno,
        motivo_parcial=proyeccion.motivo_parcial,
        valores_del_estudio=valores_del_estudio,
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
    categoria = categoria_del_paciente(equivalencias, valor_paciente)
    if categoria is not None:
        return ("coincide" if valor_estudio == categoria else "no_coincide"), None
    if valor_estudio == valor_paciente:
        return "coincide", None
    if valor_estudio in equivalencias:
        return "desconocido", "valor_fuera_de_tabla"
    return "no_coincide", None


def _por_rango(
    criterio: CriterioDeAplicabilidad, valor_paciente: str, valor_estudio: ValorDelEstudio
) -> _Veredicto:
    if not _ENTERO.fullmatch(valor_paciente):
        # El estadio («IIA») no tiene escala ordenada en el catálogo: fuera del alcance del S3 (D2b).
        sin_escala = criterio.destino.campo == "stage_value"
        return "desconocido", "sin_escala" if sin_escala else "forma_no_comparable"
    rango = rango_acotado(valor_estudio.valor, criterio)
    if rango is None:
        return "desconocido", "forma_no_comparable"
    minimo, maximo = rango
    if not minimo <= int(valor_paciente) <= maximo:
        return "no_coincide", None
    return _dentro(criterio, valor_estudio), None


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
    diseno_de_la_fuente: str | None = None,
) -> CriterioEvaluado:
    """Lee el valor del paciente por ``destination`` y los del estudio por ``studyKey`` (los de los fragmentos citados,
    o todos si ``chunk_ids_citados`` es ``None``), evalúa el criterio y le añade el aviso del dato del paciente (US-124)."""
    try:
        dato = _dato_comparable(contexto, criterio)
    except DestinoNoResoluble:
        return _desconocido(criterio, None, None, motivo="destino_no_resoluble")
    valor_paciente = None if dato is None else dato.valor
    valores = _valores_del_criterio(poblacion, criterio, chunk_ids_citados)
    if valores and not es_forma_antigua(valores):
        evaluado = _evaluar_con_lista(criterio, valor_paciente, valores, diseno_de_la_fuente)
    else:
        evaluado = evaluar_criterio(criterio, valor_paciente, valor_de_forma_antigua(valores))
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
    diseno_de_la_fuente: str | None,
) -> CriterioEvaluado:
    proyeccion = estado_de_poblacion(
        valores, valor_paciente, criterio, diseno_de_la_fuente=diseno_de_la_fuente
    )
    primero = next((v.valor for v in valores if v.alcance == "elegibilidad"), None)
    return _criterio_evaluado(criterio, valor_paciente, primero, proyeccion, valores)


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
