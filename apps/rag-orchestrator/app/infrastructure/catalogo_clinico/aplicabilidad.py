"""Adapter de ``CriteriosDeAplicabilidad`` sobre ``aplicabilidad.json`` del catálogo montado (L1D-126, D4).

El archivo es un dato versionado, no un schema del OpenAPI: se valida con modelos Pydantic escritos a mano que espejan
``packages/clinical-catalogs/schemas/aplicabilidad.schema.json`` (misma fuente de datos; el validador del catálogo en
``clinical-api`` es quien lo hace cumplir en la CI y aquí se re-comprueba al arrancar). Un criterio con campos fuera
del esquema (p. ej. ``peso``, RN-28) hace que el catálogo no esté disponible. Los mensajes nunca llevan la ruta ni el
contenido del archivo.
"""

import json
from pathlib import Path
from types import MappingProxyType
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.criterios_aplicabilidad import (
    CriterioDeAplicabilidad,
    DestinoDelCriterio,
    LimitesDeRegla,
    ReglaDeAplicabilidad,
)
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible

NOMBRE_DEL_ARCHIVO = "aplicabilidad.json"


class _Estricto(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class _Etiqueta(_Estricto):
    es: str = Field(min_length=1)
    en: str | None = Field(default=None, min_length=1)


class _Destino(_Estricto):
    entity: str
    field: str | None = None
    match: dict[str, str | list[str]] = Field(default_factory=dict)


class _Parcial(_Estricto):
    when: Literal["solo_subgrupo", "rango_solapado"]


class _Limites(_Estricto):
    min: float | None = None
    max: float | None = None


class _Regla(_Estricto):
    operator: Literal["igualdad", "pertenencia", "rango"]
    equivalences: dict[str, list[str]] = Field(default_factory=dict)
    partial: _Parcial
    limits: _Limites | None = None


class _Criterio(_Estricto):
    key: str
    cancerType: str
    studyKey: str
    label: _Etiqueta
    destination: _Destino
    isExclusionary: bool
    rule: _Regla
    estado: Literal["propuesta", "pendiente", "revisado"]


class _Archivo(_Estricto):
    version: str
    validation: dict[str, object] | None = None
    items: list[_Criterio]


class CriteriosDelCatalogo:
    """Implementa ``CriteriosDeAplicabilidad`` sobre criterios ya leídos."""

    def __init__(self, por_tipo: dict[str, tuple[CriterioDeAplicabilidad, ...]]) -> None:
        self._por_tipo = dict(por_tipo)

    def criterios(self, tipo_de_cancer: str) -> tuple[CriterioDeAplicabilidad, ...]:
        return self._por_tipo.get(tipo_de_cancer, ())


def cargar_criterios_de_aplicabilidad(
    catalogos: Path, tipos_de_cancer: tuple[str, ...]
) -> CriteriosDelCatalogo:
    """Lee una vez ``<catálogos>/<tipo>/aplicabilidad.json`` de cada tipo del manifiesto (solo lectura)."""
    return CriteriosDelCatalogo(
        {
            tipo: _leer_criterios_del_tipo(catalogos / tipo / NOMBRE_DEL_ARCHIVO)
            for tipo in tipos_de_cancer
        }
    )


def _leer_criterios_del_tipo(archivo: Path) -> tuple[CriterioDeAplicabilidad, ...]:
    try:
        contenido = _Archivo.model_validate(json.loads(archivo.read_text(encoding="utf-8")))
    except (
        OSError,
        ValueError,
    ):  # JSON ilegible o ValidationError de Pydantic (subclase de ValueError)
        raise CatalogoNoDisponible(
            "aplicabilidad.json no está disponible o no cumple su esquema"
        ) from None
    return tuple(_a_criterio_del_dominio(item) for item in contenido.items)


def _a_criterio_del_dominio(item: _Criterio) -> CriterioDeAplicabilidad:
    destino = item.destination
    regla = item.rule
    return CriterioDeAplicabilidad(
        clave=item.key,
        tipo_de_cancer=item.cancerType,
        clave_de_estudio=item.studyKey,
        etiqueta_es=item.label.es,
        etiqueta_en=item.label.en,
        destino=DestinoDelCriterio(
            entidad=destino.entity,
            campo=destino.field,
            coincidencia=MappingProxyType(
                {nombre: _como_tupla(valor) for nombre, valor in destino.match.items()}
            ),
        ),
        es_excluyente=item.isExclusionary,
        regla=ReglaDeAplicabilidad(
            operador=regla.operator,
            parcial_cuando=regla.partial.when,
            equivalencias=MappingProxyType(
                {canonico: tuple(valores) for canonico, valores in regla.equivalences.items()}
            ),
            limites=LimitesDeRegla(regla.limits.min, regla.limits.max) if regla.limits else None,
        ),
        estado=item.estado,
    )


def _como_tupla(valor: str | list[str]) -> tuple[str, ...]:
    return (valor,) if isinstance(valor, str) else tuple(valor)
