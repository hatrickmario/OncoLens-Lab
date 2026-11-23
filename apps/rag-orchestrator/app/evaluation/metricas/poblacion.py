"""Métricas puras de la familia `poblacion` (L1D-299, US-233b): precisión y cobertura por criterio, duplicados, cortes por
longitud, concordancia de estados, regresión de «sin evidencia», tasa del bucle y veredicto. Sin E/S ni reloj."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class ParMedido:
    """Un par (documento, criterio) del dorado: lo esperado y lo que la extracción guardó, ya normalizados."""

    documento: str
    criterio: str
    esperados: frozenset[str]
    obtenidos: tuple[str, ...]
    redaccion: str = "plantilla"
    """``plantilla`` o ``dificil``: cómo está redactado el fragmento del par (S7-D3, D-2)."""
    tipo: str | None = None
    """Tipo de redacción difícil (negación, rango…); ``None`` en las de plantilla."""
    distractor: bool = False
    """El esperado no tiene valores de elegibilidad: el valor solo aparece como subgrupo o mención (D-3)."""
    como_elegibilidad: int = 0
    """Cuántos de los ``obtenidos`` la extracción guardó con alcance ``elegibilidad``."""


@dataclass(frozen=True)
class Fraccion:
    aciertos: int
    total: int

    @property
    def valor(self) -> float | None:
        """``None`` (≠ ``0.0``) cuando no hay nada que medir."""
        return None if self.total == 0 else self.aciertos / self.total


ESTADOS = ("coincide", "parcial", "no_coincide", "desconocido")
CORTADA = "length"
MARCA_FUERA_DE_META = "fuera_de_meta"
INVARIANTE_CORTES = "finish_reason_length"
INVARIANTE_SIN_EVIDENCIA = "sin_evidencia"


def _agrupado(
    pares: Sequence[ParMedido],
    clave: Callable[[ParMedido], str | None],
    aciertos_y_total: Callable[[ParMedido], Fraccion],
) -> dict[str, Fraccion]:
    """Suma ``aciertos_y_total`` por la clave de cada par; un par sin clave (``None``) no entra en ningún grupo."""
    acumulado: dict[str, Fraccion] = {}
    for par in pares:
        grupo = clave(par)
        if grupo is None:
            continue
        parcial = aciertos_y_total(par)
        previo = acumulado.get(grupo, Fraccion(0, 0))
        acumulado[grupo] = Fraccion(
            previo.aciertos + parcial.aciertos, previo.total + parcial.total
        )
    return acumulado


def _precision_del_par(par: ParMedido) -> Fraccion:
    return Fraccion(sum(v in par.esperados for v in par.obtenidos), len(par.obtenidos))


def _cobertura_del_par(par: ParMedido) -> Fraccion:
    return Fraccion(len(par.esperados & set(par.obtenidos)), len(par.esperados))


def _criterio(par: ParMedido) -> str:
    return par.criterio


def precision_por_criterio(pares: Sequence[ParMedido]) -> dict[str, Fraccion]:
    """Obtenidos que el dorado espera / obtenidos, por criterio (M-08.3); sin obtenidos queda sin medir."""
    return _agrupado(pares, _criterio, _precision_del_par)


def cobertura_por_criterio(pares: Sequence[ParMedido]) -> dict[str, Fraccion]:
    """Esperados que la extracción guardó / esperados, por criterio (M-08.4); sin esperados queda sin medir."""
    return _agrupado(pares, _criterio, _cobertura_del_par)


def precision_por_redaccion(pares: Sequence[ParMedido]) -> dict[str, Fraccion]:
    """La misma precisión, agrupada por ``plantilla`` o ``dificil`` (S7-D3, D-2)."""
    return _agrupado(pares, lambda p: p.redaccion, _precision_del_par)


def cobertura_por_redaccion(pares: Sequence[ParMedido]) -> dict[str, Fraccion]:
    """La misma cobertura, agrupada por ``plantilla`` o ``dificil``."""
    return _agrupado(pares, lambda p: p.redaccion, _cobertura_del_par)


def precision_por_tipo_de_redaccion(pares: Sequence[ParMedido]) -> dict[str, Fraccion]:
    """La misma precisión, por tipo de redacción difícil; los pares de plantilla (sin tipo) no entran."""
    return _agrupado(pares, lambda p: p.tipo, _precision_del_par)


def cobertura_por_tipo_de_redaccion(pares: Sequence[ParMedido]) -> dict[str, Fraccion]:
    """La misma cobertura, por tipo de redacción difícil."""
    return _agrupado(pares, lambda p: p.tipo, _cobertura_del_par)


@dataclass(frozen=True)
class ValoresEnDistractores:
    pares: int
    valores_indebidos: int
    """Valores que la extracción guardó como elegibilidad en un distractor (D-3)."""
    pares_con_indebidos: int


def valores_indebidos_en_distractores(pares: Sequence[ParMedido]) -> ValoresEnDistractores:
    """Cuenta aparte lo que la extracción dio como elegibilidad donde el dorado solo espera subgrupo o mención."""
    distractores = [p for p in pares if p.distractor]
    return ValoresEnDistractores(
        len(distractores),
        sum(p.como_elegibilidad for p in distractores),
        sum(p.como_elegibilidad > 0 for p in distractores),
    )


def tasa_duplicados(pares: Sequence[ParMedido]) -> Fraccion:
    """Valores repetidos dentro de un par / valores obtenidos (RN-27)."""
    repetidos = sum(len(p.obtenidos) - len(set(p.obtenidos)) for p in pares)
    return Fraccion(repetidos, sum(len(p.obtenidos) for p in pares))


def cortes_por_longitud(tareas: Sequence[tuple[str, str, str]]) -> list[tuple[str, str]]:
    """(documento, criterio) de cada tarea con ``finish_reason = length``, una vez aunque el reintento también se corte;
    solo identificadores (RN-14)."""
    return list(
        dict.fromkeys(
            (documento, criterio) for documento, criterio, motivo in tareas if motivo == CORTADA
        )
    )


@dataclass(frozen=True)
class CasoDeEstado:
    id: str
    esperado: str
    calculado: str
    rendija: bool = False
    """El caso mide la rendija de C-3: elegibilidad de un solo valor sin «solo» (Q-1)."""


@dataclass(frozen=True)
class ConcordanciaDeEstados:
    por_estado: Mapping[str, Fraccion]
    total: Fraccion
    no_coincide_indebido: int
    coincide_indebido: int


def concordancia_de_estados(casos: Sequence[CasoDeEstado]) -> ConcordanciaDeEstados:
    """Aciertos por estado esperado y, aparte, cada No coincide indebido (ADR47-R2) y cada Coincide indebido (ADR47-R1)."""
    por_estado = {
        estado: Fraccion(
            sum(c.calculado == estado for c in casos if c.esperado == estado),
            sum(c.esperado == estado for c in casos),
        )
        for estado in ESTADOS
    }
    return ConcordanciaDeEstados(
        por_estado,
        Fraccion(sum(c.esperado == c.calculado for c in casos), len(casos)),
        sum(c.calculado == "no_coincide" and c.esperado != "no_coincide" for c in casos),
        sum(c.calculado == "coincide" and c.esperado != "coincide" for c in casos),
    )


@dataclass(frozen=True)
class RecuentoDeRendija:
    casos: int
    desconocido: int
    """Casos de la rendija que la regla vigente deja en ``desconocido``."""
    otros: int
    """Casos de la rendija que la regla ya resuelve a otro estado (la rendija se cerró)."""


def recuento_de_rendija(casos: Sequence[CasoDeEstado]) -> RecuentoDeRendija:
    """Mide la rendija de C-3 sin cambiar la regla: cuántos casos siguen sin resolverse."""
    de_la_rendija = [c for c in casos if c.rendija]
    desconocido = sum(c.calculado == "desconocido" for c in de_la_rendija)
    return RecuentoDeRendija(len(de_la_rendija), desconocido, len(de_la_rendija) - desconocido)


@dataclass(frozen=True)
class RegresionSinEvidencia:
    baseline: float | None
    actual: float | None
    baja: bool
    violaciones_rn02: int
    """Respuestas sin evidencia que invocaron al LLM o dejaron ``top_relevance_score`` distinto de ``null``."""

    @property
    def violada(self) -> bool:
        return self.baja or self.violaciones_rn02 > 0


def sin_evidencia_vs_baseline(
    baseline: float | None,
    actual: float | None,
    violaciones_rn02: int,
) -> RegresionSinEvidencia:
    """RN-02: no baja del baseline (una métrica sin medir cuenta como baja) y el camino sin evidencia no invoca al LLM
    ni deja ``top_relevance_score`` distinto de ``null``."""
    baja = actual is None or (baseline is not None and actual < baseline)
    return RegresionSinEvidencia(baseline, actual, baja, violaciones_rn02)


@dataclass(frozen=True)
class TasaDelBucle:
    pares: int
    cortes: int
    tasa: float | None
    minimo_de_pares: int
    out06: str


def tasa_cortes_del_bucle(pares: int, pares_con_corte: int, minimo_de_pares: int) -> TasaDelBucle:
    """OUT-06 queda ``cerrada`` solo con tasa 0 sobre al menos ``minimo_de_pares``; con menos, ``insuficiente``."""
    tasa = None if pares == 0 else pares_con_corte / pares
    if pares < minimo_de_pares:
        out06 = "insuficiente"
    else:
        out06 = "cerrada" if pares_con_corte == 0 else "abierta"
    return TasaDelBucle(pares, pares_con_corte, tasa, minimo_de_pares, out06)


@dataclass(frozen=True)
class Veredicto:
    resultado: str
    causas: tuple[str, ...]
    invariantes_violadas: tuple[str, ...]


def veredicto(
    *,
    cortes: int,
    sin_evidencia_violada: bool,
    revisor_completo: bool,
    pares_del_dorado: int,
    minimo_de_pares: int,
    marcas: Sequence[str],
) -> Veredicto:
    """``fail`` con una invariante violada o una marca fuera de meta; ``no_concluyente`` sin revisor o con muestra
    insuficiente (ADR47-R9); ``pass`` solo si ninguna de las dos cosas."""
    violadas = tuple(
        nombre
        for nombre, violada in (
            (INVARIANTE_CORTES, cortes > 0),
            (INVARIANTE_SIN_EVIDENCIA, sin_evidencia_violada),
        )
        if violada
    )
    causas = tuple(
        causa
        for causa, aplica in (
            ("sin_revisor", not revisor_completo),
            ("muestra_insuficiente", pares_del_dorado < minimo_de_pares),
        )
        if aplica
    )
    if violadas or MARCA_FUERA_DE_META in marcas:
        return Veredicto("fail", causas, violadas)
    return Veredicto("no_concluyente" if causas else "pass", causas, violadas)
