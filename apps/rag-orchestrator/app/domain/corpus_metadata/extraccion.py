"""Reglas puras de la extracción de metadatos (US-118, D3): qué se pide al LLM y cómo se integra lo verificado."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from app.domain.corpus_metadata.campos import CAMPOS_ESCALARES, DISENO_NO_DECLARADO
from app.domain.corpus_metadata.resultado import (
    EXTRAIDO_VERIFICADO,
    PENDIENTE,
    CampoDeMetadato,
    FalloDeMetadatos,
    MetadatosResueltos,
)
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.poblacion import NO_DISPONIBLE, resolver_criterios_poblacion

_PREFIJO_DE_BIOMARCADOR = "biomarcadores."


def resolver_como_pendiente(
    documento: DocumentoDeSemilla, fallo: FalloDeMetadatos
) -> MetadatosResueltos:
    """La extracción no corrió (LLM o NLI caídos, o salida inválida): nada extraído y ``pendiente``, nunca
    ``fuente_estructurada`` (la fuente no publicó nada, RN-25). Lo que el manifiesto declara se conserva (D2)."""
    return MetadatosResueltos(
        study_design=documento.study_design,
        trial_phase=documento.trial_phase,
        sample_size=documento.sample_size,
        primary_endpoint=documento.primary_endpoint,
        population_criteria=resolver_criterios_poblacion(None),
        metadata_source=PENDIENTE,
        fallo=fallo,
    )


def escalares_a_extraer(documento: DocumentoDeSemilla) -> tuple[str, ...]:
    """Escalares que el manifiesto NO declara: lo declarado se respeta siempre y no se pide al LLM (D2).

    ``study_design = otro`` es el valor de "la fuente no lo clasifica" (D3): se pide. Los demás, si son ``None``.
    """
    pendientes = []
    if documento.study_design == DISENO_NO_DECLARADO:
        pendientes.append("study_design")
    if documento.trial_phase is None:
        pendientes.append("trial_phase")
    if documento.sample_size is None:
        pendientes.append("sample_size")
    if documento.primary_endpoint is None:
        pendientes.append("primary_endpoint")
    return tuple(pendientes)


def integrar_metadatos_verificados(
    documento: DocumentoDeSemilla, verificados: Sequence[CampoDeMetadato]
) -> MetadatosResueltos:
    """Solo lo verificado entra; lo demás queda ``null`` (escalares) o ``no_disponible`` (criterios de población).

    ``study_design`` no verificado conserva el valor del manifiesto (columna no nula, D3).
    """
    escalares = {c.campo: c.valor for c in verificados if c.campo in CAMPOS_ESCALARES}
    return MetadatosResueltos(
        study_design=str(escalares.get("study_design", documento.study_design)),
        trial_phase=_a_texto_o_nulo(escalares.get("trial_phase", documento.trial_phase)),
        sample_size=_entero_o_nulo(escalares.get("sample_size", documento.sample_size)),
        primary_endpoint=_a_texto_o_nulo(
            escalares.get("primary_endpoint", documento.primary_endpoint)
        ),
        population_criteria=_criterios_de_poblacion(verificados),
        metadata_source=EXTRAIDO_VERIFICADO,
        campos_verificados=tuple(verificados),
    )


def _criterios_de_poblacion(verificados: Sequence[CampoDeMetadato]) -> dict[str, Any]:
    criterios: dict[str, Any] = dict(resolver_criterios_poblacion(None))
    biomarcadores: dict[str, str] = {}
    for campo in verificados:
        if campo.campo in CAMPOS_ESCALARES:
            continue
        if campo.campo.startswith(_PREFIJO_DE_BIOMARCADOR):
            biomarcadores[campo.campo.removeprefix(_PREFIJO_DE_BIOMARCADOR)] = str(campo.valor)
        else:
            criterios[campo.campo] = str(campo.valor)
    if biomarcadores:
        criterios["biomarcadores"] = biomarcadores
    return criterios


def _a_texto_o_nulo(valor: object) -> str | None:
    return None if valor is None else str(valor)


def _entero_o_nulo(valor: object) -> int | None:
    return None if valor is None else int(str(valor))


def campos_conservados(
    study_design: str,
    trial_phase: str | None,
    sample_size: int | None,
    primary_endpoint: str | None,
    population_criteria: Mapping[str, Any],
) -> tuple[CampoDeMetadato, ...]:
    """Los metadatos que una fila del catálogo conserva (lo contrario de ``integrar_metadatos_verificados``): escalares no
    nulos (``study_design = otro`` es «no declarado») y criterios de población distintos de ``no_disponible``."""
    escalares = (
        ("study_design", None if study_design == DISENO_NO_DECLARADO else study_design),
        ("trial_phase", trial_phase),
        ("sample_size", sample_size),
        ("primary_endpoint", primary_endpoint),
    )
    campos = [CampoDeMetadato(n, v) for n, v in escalares if v is not None]
    for nombre, valor in sorted(population_criteria.items()):
        if nombre == "biomarcadores" and isinstance(valor, Mapping):
            campos += [
                CampoDeMetadato(f"{_PREFIJO_DE_BIOMARCADOR}{k}", str(v)) for k, v in valor.items()
            ]
        elif valor != NO_DISPONIBLE and not isinstance(valor, Mapping):
            campos.append(CampoDeMetadato(nombre, str(valor)))
    return tuple(campos)
