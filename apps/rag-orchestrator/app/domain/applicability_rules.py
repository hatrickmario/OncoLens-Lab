"""Reglas puras de la aplicabilidad por criterio (FR-25, RN-25, RN-28, ADR-34 b, L1D-127): sin E/S, sin LLM.

Las reglas son datos del catálogo (``rule.operator``, ``equivalences``, ``limits``, ``partial.when``), nunca código por
criterio (RN-22, US-121 AC-5). Los valores del paciente y del estudio se copian sin normalizar; la comparación es por
prefijo o elemento exacto, sensible a mayúsculas y espacios (design D2b). Lo que no se puede comparar queda
``desconocido`` y se registra su motivo interno: nunca se adivina. Ninguna función produce un puntaje (RN-28).
"""

import re
from collections.abc import Callable, Iterable, Mapping, Sequence

from app.domain.aplicabilidad_tipos import (
    AtributoDelPaciente,
    CausaDeDesconocido,
    ContextoDelPaciente,
    CriterioEvaluado,
    EstadoDeCriterio,
    MotivoInterno,
    PoblacionDelEstudio,
    ResumenDeEstados,
    TratamientoPrevioDelPaciente,
    ValorDelEstudio,
)
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad, DestinoDelCriterio

VALOR_NO_DISPONIBLE = "no_disponible"
ALCANCE_SUBGRUPO = "subgrupo"
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

    Admite una cadena con texto, o un objeto ``{"valor", "alcance"}`` (Q2). ``no_disponible``, la ausencia y cualquier
    otra forma (incluida una subclave pedida sobre una cadena) son ``None``."""
    raiz, _, subclave = clave_de_estudio.partition(".")
    valor = poblacion.criterios.get(raiz)
    if subclave:
        valor = valor.get(subclave) if isinstance(valor, Mapping) else None
    return _valor_leido(valor)


def _valor_leido(valor: object) -> ValorDelEstudio | None:
    if isinstance(valor, str):
        return _con_texto(valor, solo_subgrupo=False)
    if isinstance(valor, Mapping) and isinstance(valor.get("valor"), str):
        return _con_texto(valor["valor"], solo_subgrupo=valor.get("alcance") == ALCANCE_SUBGRUPO)
    return None


def _con_texto(texto: str, *, solo_subgrupo: bool) -> ValorDelEstudio | None:
    if not texto or texto == VALOR_NO_DISPONIBLE:
        return None
    return ValorDelEstudio(texto, solo_subgrupo)


# --- valor del paciente (ADR-34 b, design D3) --------------------------------------------------------------------


def valor_del_paciente(contexto: ContextoDelPaciente, destino: DestinoDelCriterio) -> str | None:
    """Copia literal del dato del paciente que indica el ``destination`` del catálogo, o ``None`` si falta.

    Con varios valores del mismo destino gana el de menor ``monthsAgo`` y, a igualdad, el primero de la petición.
    ``DestinoNoResoluble`` si el destino no es uno de los conocidos: ``None`` no puede significar dos cosas."""
    lector = _LECTORES_DE_DESTINO.get((destino.entidad, destino.campo))
    if lector is None:
        raise DestinoNoResoluble(f"{destino.entidad}.{destino.campo}")
    return lector(contexto, destino.coincidencia)


def _nombres_exigidos(coincidencia: Mapping[str, tuple[str, ...]]) -> tuple[str, ...]:
    nombres = coincidencia.get("name")
    if not nombres:
        raise DestinoNoResoluble("Biomarker sin match.name")
    return nombres


def _valor_de_biomarcador(contexto: ContextoDelPaciente, nombre: str) -> str | None:
    biomarcadores = (b for b in contexto.biomarcadores if b.nombre == nombre)
    return _el_mas_reciente(biomarcadores, lambda b: b.meses_atras, lambda b: b.valor)


def _leer_biomarcador(
    contexto: ContextoDelPaciente, coincidencia: Mapping[str, tuple[str, ...]]
) -> str | None:
    nombres = _nombres_exigidos(coincidencia)
    valores = [_valor_de_biomarcador(contexto, nombre) for nombre in nombres]
    if len(nombres) == 1:
        return valores[0]
    if any(valor is None for valor in valores):
        return None
    return "; ".join(f"{nombre}: {valor}" for nombre, valor in zip(nombres, valores))


def _leer_ecog(
    contexto: ContextoDelPaciente, coincidencia: Mapping[str, tuple[str, ...]]
) -> str | None:
    escala = coincidencia.get("performance_scale")
    if not escala:
        raise DestinoNoResoluble("performance_value sin match.performance_scale")
    if contexto.escala_de_desempeno not in escala or contexto.valor_de_desempeno is None:
        return None
    return str(contexto.valor_de_desempeno)


def _leer_atributo(
    contexto: ContextoDelPaciente, coincidencia: Mapping[str, tuple[str, ...]]
) -> str | None:
    claves = coincidencia.get("attribute_key")
    if not claves:
        raise DestinoNoResoluble("ClinicalAttribute sin match.attribute_key")
    atributos = (a for a in contexto.atributos if a.clave in claves)
    return _el_mas_reciente(atributos, _meses_de_atributo, lambda a: a.valor)


def _leer_linea(
    contexto: ContextoDelPaciente, coincidencia: Mapping[str, tuple[str, ...]]
) -> str | None:
    con_numero = (t for t in contexto.tratamientos_previos if t.numero_de_linea is not None)
    return _el_mas_reciente(con_numero, _meses_de_tratamiento, lambda t: str(t.numero_de_linea))


def _meses_de_atributo(atributo: AtributoDelPaciente) -> int:
    return _SIN_FECHA if atributo.meses_atras is None else atributo.meses_atras


def _meses_de_tratamiento(tratamiento: TratamientoPrevioDelPaciente) -> int:
    inicio = tratamiento.meses_desde_el_inicio
    return _SIN_FECHA if inicio is None else inicio


_SIN_FECHA = 10**9
"""Un valor sin fecha pierde frente a cualquiera con fecha; entre iguales gana el primero de la petición."""

type _Lector = Callable[[ContextoDelPaciente, Mapping[str, tuple[str, ...]]], str | None]

_LECTORES_DE_DESTINO: Mapping[tuple[str, str | None], _Lector] = {
    ("Biomarker", "value"): _leer_biomarcador,
    ("Diagnosis", "stage_value"): lambda contexto, _: contexto.valor_de_estadio,
    ("Diagnosis", "grade"): lambda contexto, _: contexto.grado,
    ("Diagnosis", "performance_value"): _leer_ecog,
    ("ClinicalAttribute", "value"): _leer_atributo,
    ("PriorTreatment", "line_number"): _leer_linea,
}


def _el_mas_reciente[T](
    candidatos: Iterable[T], meses_atras: Callable[[T], int], valor: Callable[[T], str]
) -> str | None:
    """El valor del candidato con menos meses de antigüedad; ``min`` conserva el primero ante un empate."""
    elegido = min(candidatos, key=meses_atras, default=None)
    return None if elegido is None else valor(elegido)


# --- evaluación de un criterio (FR-25, design D2 y D2b) ------------------------------------------------------------


type _Veredicto = tuple[EstadoDeCriterio, MotivoInterno | None]


def evaluar_criterio(
    criterio: CriterioDeAplicabilidad,
    valor_paciente: str | None,
    valor_estudio: ValorDelEstudio | None,
) -> CriterioEvaluado:
    """Estado del criterio con la ``rule`` del catálogo. Precedencia de la causa: ``falta_en_paciente`` gana a
    ``no_reportado_por_fuente`` (D5); un valor presente pero no comparable es ``desconocido`` sin causa."""
    copiado = valor_estudio.valor if valor_estudio else None
    if valor_paciente is None:
        return _desconocido(criterio, valor_paciente, copiado, causa="falta_en_paciente")
    if valor_estudio is None:
        return _desconocido(criterio, valor_paciente, copiado, causa="no_reportado_por_fuente")
    estado, motivo = _veredicto(criterio, valor_paciente, valor_estudio)
    return CriterioEvaluado(
        criterio.clave, valor_paciente, copiado, estado, None, criterio.es_excluyente, motivo
    )


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
    if len(criterio.destino.coincidencia.get("name", ())) > 1:
        # RE/RP, HRR/BRCA: el estudio guarda una sola cadena y no hay componente contra componente que comparar.
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
) -> CriterioEvaluado:
    """Lee el valor del paciente por ``destination`` y el del estudio por ``studyKey`` y evalúa el criterio."""
    try:
        valor_paciente = valor_del_paciente(contexto, criterio.destino)
    except DestinoNoResoluble:
        return _desconocido(criterio, None, None, motivo="destino_no_resoluble")
    return evaluar_criterio(
        criterio, valor_paciente, valor_del_estudio(poblacion, criterio.clave_de_estudio)
    )


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
    return any(c.es_excluyente and c.estado == "no_coincide" for c in criterios)
