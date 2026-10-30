"""Adapter de ``CriteriosDeAplicabilidad`` sobre ``aplicabilidad.json`` del catálogo montado (L1D-126, D4).

El archivo es un dato versionado, no un schema del OpenAPI: se valida con modelos Pydantic escritos a mano que espejan
``packages/clinical-catalogs/schemas/aplicabilidad.schema.json`` (misma fuente de datos; el validador del catálogo en
``clinical-api`` es quien lo hace cumplir en la CI y aquí se re-comprueba al arrancar). Un criterio con campos fuera
del esquema (p. ej. ``peso``, RN-28) hace que el catálogo no esté disponible. Los mensajes nunca llevan la ruta ni el
contenido del archivo.
"""

import json
import re
from pathlib import Path
from types import MappingProxyType
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

from app.domain.criterios_aplicabilidad import (
    CondicionDeParcial,
    CriterioDeAplicabilidad,
    DestinoDelCriterio,
    EstadoDeRevision,
    LimitesDeRegla,
    OperadorDeRegla,
    ReglaDeAplicabilidad,
)
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible
from app.infrastructure.catalogo_clinico.poblacion_reglas import (
    NOMBRE_DEL_ARCHIVO_DE_REGLAS,
    ReglasDePoblacionDelTipo,
    leer_reglas_de_poblacion,
)

NOMBRE_DEL_ARCHIVO = "aplicabilidad.json"


# Patrones y cotas idénticos a ``comun.schema.json`` y ``aplicabilidad.schema.json``; el test de paridad
# (tests/unit/test_paridad_aplicabilidad_esquema.py) falla si el espejo se vuelve más laxo que el esquema.
_CLAVE = r"^[a-z0-9_]+$"
_TIPO_DE_CANCER = r"^[a-z]+$"
_CLAVE_DE_ESTUDIO = r"^[a-z0-9_]+(\.[a-z0-9_]+)?$"
_ENTIDAD = r"^[A-Z][A-Za-z]+$"
_CAMPO = r"^[a-z][a-z0-9_]*$"
_CLAVE_DE_COINCIDENCIA = r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$"
_VERSION = r"^(test-([a-z]+-)?)?\d+\.\d+\.\d+$"
_MINUSCULAS_Y_GUION_BAJO = r"^[a-z_]+$"


def _sin_repetidos(valores: list[str]) -> list[str]:
    if len(set(valores)) != len(valores):
        raise ValueError("valores repetidos")
    return valores


_Texto = Annotated[str, Field(min_length=1)]
_ListaUnica = Annotated[list[_Texto], Field(min_length=1), AfterValidator(_sin_repetidos)]


class _Estricto(BaseModel):
    # strict: ``"true"`` o ``1`` no son booleanos, ``"0"`` no es número (el esquema JSON también los rechaza).
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    @model_validator(mode="before")
    @classmethod
    def _rechazar_null_explicito(cls, datos: object) -> object:
        """El esquema JSON pide el campo opcional ausente, no ``null``: ``{"en": null}`` es inválido."""
        if isinstance(datos, dict) and any(valor is None for valor in datos.values()):
            raise ValueError("null explícito")
        return datos


class _Etiqueta(_Estricto):
    es: _Texto
    en: _Texto | None = None


class _Destino(_Estricto):
    entity: str = Field(pattern=_ENTIDAD)
    field: str | None = Field(default=None, pattern=_CAMPO)
    match: dict[Annotated[str, Field(pattern=_CLAVE_DE_COINCIDENCIA)], _Texto | _ListaUnica] = (
        Field(default_factory=dict)
    )


class _Parcial(_Estricto):
    when: CondicionDeParcial


class _Limites(_Estricto):
    min: float | None = None
    max: float | None = None

    @model_validator(mode="after")
    def _exigir_algun_extremo(self) -> "_Limites":
        if self.min is None and self.max is None:
            raise ValueError("limits sin ningún extremo")
        return self


class _Regla(_Estricto):
    operator: OperadorDeRegla
    equivalences: (
        Annotated[dict[Annotated[str, Field(pattern=_CLAVE)], _ListaUnica], Field(min_length=1)]
        | None
    ) = None
    partial: _Parcial
    limits: _Limites | None = None


class _Criterio(_Estricto):
    key: str = Field(pattern=_CLAVE)
    cancerType: str = Field(pattern=_TIPO_DE_CANCER)
    studyKey: str = Field(pattern=_CLAVE_DE_ESTUDIO)
    label: _Etiqueta
    destination: _Destino
    isExclusionary: bool
    rule: _Regla
    estado: EstadoDeRevision


class _Validacion(_Estricto):
    scope: Annotated[
        list[Literal["datos_criticos", "matriz_item_campo", "aplicabilidad"]],
        Field(min_length=1),
        AfterValidator(_sin_repetidos),
    ]
    status: str = Field(pattern=_MINUSCULAS_Y_GUION_BAJO)
    reviewerRole: str = Field(pattern=_MINUSCULAS_Y_GUION_BAJO)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    catalogHash: str = Field(pattern=r"^[0-9a-f]{64}$")


class _Archivo(_Estricto):
    version: str = Field(pattern=_VERSION)
    validation: _Validacion | None = None
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
    """Lee una vez ``<catálogos>/<tipo>/aplicabilidad.json`` de cada tipo del manifiesto (solo lectura).

    Un tipo que no sea ``^[a-z]+$`` (p. ej. ``..``) no es un directorio del catálogo: ``CatalogoNoDisponible``."""
    if not all(re.fullmatch(_TIPO_DE_CANCER, tipo) for tipo in tipos_de_cancer):
        raise CatalogoNoDisponible("el manifiesto declara un tipo de cáncer inválido")
    return CriteriosDelCatalogo(
        {
            tipo: _leer_criterios_del_tipo(
                catalogos / tipo / NOMBRE_DEL_ARCHIVO,
                leer_reglas_de_poblacion(catalogos / tipo / NOMBRE_DEL_ARCHIVO_DE_REGLAS),
            )
            for tipo in tipos_de_cancer
        }
    )


def _sin_claves_repetidas(pares: list[tuple[str, object]]) -> dict[str, object]:
    claves = [clave for clave, _ in pares]
    if len(set(claves)) != len(claves):
        raise ValueError("clave repetida")
    return dict(pares)


def _rechazar_constante_no_finita(constante: str) -> object:
    raise ValueError("constante no finita")


def _leer_json_estricto(texto: str) -> object:
    """JSON sin claves repetidas ni ``NaN``/``Infinity`` (``json.loads`` los acepta; el esquema JSON no)."""
    return json.loads(
        texto,
        object_pairs_hook=_sin_claves_repetidas,
        parse_constant=_rechazar_constante_no_finita,
    )


def _leer_criterios_del_tipo(
    archivo: Path, reglas_de_poblacion: ReglasDePoblacionDelTipo
) -> tuple[CriterioDeAplicabilidad, ...]:
    try:
        contenido = _Archivo.model_validate(
            _leer_json_estricto(archivo.read_text(encoding="utf-8"))
        )
    except (
        OSError,
        ValueError,
    ):  # JSON ilegible o ValidationError de Pydantic (subclase de ValueError)
        raise CatalogoNoDisponible(
            "aplicabilidad.json no está disponible o no cumple su esquema"
        ) from None
    return tuple(_a_criterio_del_dominio(item, reglas_de_poblacion) for item in contenido.items)


def _a_criterio_del_dominio(
    item: _Criterio, reglas_de_poblacion: ReglasDePoblacionDelTipo
) -> CriterioDeAplicabilidad:
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
                {
                    canonico: tuple(valores)
                    for canonico, valores in (regla.equivalences or {}).items()
                }
            ),
            limites=LimitesDeRegla(regla.limits.min, regla.limits.max) if regla.limits else None,
        ),
        estado_de_revision=item.estado,
        poblacion=reglas_de_poblacion.de(item.key),
    )


def _como_tupla(valor: str | list[str]) -> tuple[str, ...]:
    return (valor,) if isinstance(valor, str) else tuple(valor)
