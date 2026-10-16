"""Reglas puras de selección de modelos y de variantes de chunking de ADR-39 (sin E/S).

Reciben mediciones ya hechas. Los límites llegan por parámetro desde la configuración (RN-22):
``STACK_MEMORY_LIMIT_GB``, ``STAGE_P95_BUDGET_MS`` y ``ACADEMIC_LICENSES``.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

SIN_CANDIDATO = "sin_candidato"


@dataclass(frozen=True)
class Medicion:
    """Cifras medidas de un candidato (mediana de las corridas)."""

    candidato: str
    etapa: str
    memoria_gb: float
    p95_ms: float
    licencia: str
    metrica_principal: float


@dataclass(frozen=True)
class Restricciones:
    stack_memory_limit_gb: float
    llm_budget_gb: float
    stage_p95_budget_ms: dict[str, float]
    academic_licenses: frozenset[str]


@dataclass(frozen=True)
class Descarte:
    candidato: str
    motivo: str
    cifra: str


@dataclass(frozen=True)
class Seleccion:
    etapa: str
    elegido: Medicion | None
    descartados: tuple[Descarte, ...]
    desempatado_por_memoria: bool

    @property
    def sin_candidato(self) -> bool:
        return self.elegido is None


def dentro_de_tolerancia(valor: float, referencia: float, tolerancia: float) -> bool:
    raise NotImplementedError


def descartar_por_restricciones(
    mediciones: Sequence[Medicion], restricciones: Restricciones
) -> tuple[list[Medicion], list[Descarte]]:
    """Separa los candidatos válidos de los descartados, con motivo y cifra medida (AC-2).

    Un candidato descartado lo es aunque tenga la mejor métrica principal.
    """
    validos: list[Medicion] = []
    descartados: list[Descarte] = []
    for m in mediciones:
        motivos = _motivos_de_descarte(m, restricciones)
        if motivos:
            descartados.extend(motivos)
        else:
            validos.append(m)
    return validos, descartados


def _motivos_de_descarte(m: Medicion, r: Restricciones) -> list[Descarte]:
    motivos: list[Descarte] = []
    total_gb = m.memoria_gb + r.llm_budget_gb
    if total_gb > r.stack_memory_limit_gb:
        motivos.append(
            Descarte(
                m.candidato,
                "memoria",
                f"{m.memoria_gb:.2f} GB + LLM {r.llm_budget_gb:.1f} GB = {total_gb:.2f} GB > {r.stack_memory_limit_gb:.1f} GB",
            )
        )
    presupuesto_ms = r.stage_p95_budget_ms[m.etapa]
    if m.p95_ms > presupuesto_ms:
        motivos.append(Descarte(m.candidato, "p95", f"{m.p95_ms:.0f} ms > {presupuesto_ms:.0f} ms ({m.etapa})"))
    if m.licencia not in r.academic_licenses:
        motivos.append(Descarte(m.candidato, "licencia", f"{m.licencia!r} fuera de ACADEMIC_LICENSES"))
    return motivos


def desempatar_por_memoria(empatados: Sequence[Medicion]) -> Medicion:
    """Gana el de menor memoria residente; a igual memoria, el de menor p95 y luego el nombre (AC-4)."""
    return min(empatados, key=lambda m: (m.memoria_gb, m.p95_ms, m.candidato))


def seleccionar_componente(
    mediciones: Sequence[Medicion],
    restricciones: Restricciones,
    tolerancia_empate: float = 0.0,
) -> Seleccion:
    """Elige el mejor candidato válido de una etapa; ``sin_candidato`` si ninguno cumple (AC-5).

    Dentro de ``tolerancia_empate`` de la mejor métrica se considera empate y decide la memoria.
    """
    etapa = mediciones[0].etapa if mediciones else ""
    validos, descartados = descartar_por_restricciones(mediciones, restricciones)
    if not validos:
        return Seleccion(etapa, None, tuple(descartados), False)
    mejor = max(m.metrica_principal for m in validos)
    empatados = [m for m in validos if mejor - m.metrica_principal <= tolerancia_empate]
    return Seleccion(
        etapa,
        desempatar_por_memoria(empatados),
        tuple(descartados),
        desempatado_por_memoria=len(empatados) > 1,
    )


def verificar_presupuesto_conjunto(elegidos: Sequence[Medicion], restricciones: Restricciones) -> tuple[bool, float]:
    """Suma de las memorias elegidas más el LLM frente al límite del stack (D3). Devuelve (cabe, total_gb)."""
    total = sum(m.memoria_gb for m in elegidos) + restricciones.llm_budget_gb
    return total <= restricciones.stack_memory_limit_gb, total


@dataclass(frozen=True)
class MedicionVariante:
    """Cifras de una variante de chunking o de índice (T2–T5)."""

    variante: str
    recall_at_10: float
    numero_chunks: int
    simplicidad: int  # menor = más simple (tamaño fijo y 0 % de solapamiento = 0)


def seleccionar_variante(variantes: Sequence[MedicionVariante], margen: float) -> MedicionVariante:
    """Mayor recall@10 si supera ``margen`` a la mejor de menos chunks; si no, menos chunks; si empatan, la más simple.

    La base de comparación es la variante más barata (menos chunks, luego más simple): solo una
    diferencia de recall@10 mayor que ``CHUNK_SELECTION_MARGIN`` sobre ella justifica pagar más chunks.
    """
    barata = min(variantes, key=lambda v: (v.numero_chunks, v.simplicidad, v.variante))
    mejor_recall = max(v.recall_at_10 for v in variantes)
    if round(mejor_recall - barata.recall_at_10, 9) <= margen:
        return barata
    candidatas = [v for v in variantes if v.recall_at_10 == mejor_recall]
    return min(candidatas, key=lambda v: (v.numero_chunks, v.simplicidad, v.variante))
