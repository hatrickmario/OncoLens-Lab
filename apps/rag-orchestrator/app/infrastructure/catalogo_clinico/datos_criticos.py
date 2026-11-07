"""Adapter de ``EtiquetasDeDatosCriticos`` sobre ``datos-criticos.json`` del catálogo montado (US-116 / L1D-113).

Solo lectura y una vez al arrancar (``CLINICAL_CATALOG_PATH``): de cada tipo del manifiesto se toman la clave, la
etiqueta en español y los tipos de documento fuente (``sourceDocumentTypes``, US-263) de cada dato crítico. El resto del archivo (destino, ``minValues``, revisión) lo hace cumplir el
validador del catálogo en la CI. Un archivo ausente, ilegible o fuera de esquema deja el catálogo no disponible
(falla cerrado); los mensajes nunca llevan la ruta ni el contenido del archivo.
"""

import json
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from types import MappingProxyType
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.domain.criterios_aplicabilidad import DestinoDelCriterio
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible

NOMBRE_DEL_ARCHIVO = "datos-criticos.json"

# Patrones idénticos a ``comun.schema.json``: la clave es ``^[a-z0-9_]+$`` y el tipo ``^[a-z]+$``.
_CLAVE = r"^[a-z0-9_]+$"
_TIPO_DE_CANCER = r"^[a-z]+$"


_TipoDeDocumento = Literal["historia_clinica", "examen"]
"""El enum ``document_type`` del modelo: el mismo vocabulario cerrado que declara el esquema del catálogo."""


class _Etiqueta(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    es: Annotated[str, Field(min_length=1)]


class _Destino(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    entity: Annotated[str, Field(min_length=1)]
    field: str | None = None
    match: dict[str, str | list[str]] = Field(default_factory=dict)


class _DatoCritico(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    key: str = Field(pattern=_CLAVE)
    cancerType: str = Field(pattern=_TIPO_DE_CANCER)
    label: _Etiqueta
    destination: _Destino
    sourceDocumentTypes: Annotated[list[_TipoDeDocumento], Field(min_length=1)]


class _Archivo(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    items: list[_DatoCritico]

    @model_validator(mode="after")
    def _sin_claves_repetidas(self) -> "_Archivo":
        claves = [item.key for item in self.items]
        if len(set(claves)) != len(claves):
            raise ValueError("clave repetida")
        return self


_SIN_DATOS: Mapping[str, str] = MappingProxyType({})
_SIN_FUENTES: Mapping[str, tuple[str, ...]] = MappingProxyType({})
_SIN_DESTINOS: Mapping[str, DestinoDelCriterio] = MappingProxyType({})


class DatosCriticosDelCatalogo:
    """Implementa ``EtiquetasDeDatosCriticos`` sobre las etiquetas ya leídas."""

    def __init__(
        self,
        etiquetas_por_tipo: dict[str, dict[str, str]],
        fuentes_por_tipo: dict[str, dict[str, tuple[str, ...]]] | None = None,
        destinos_por_tipo: dict[str, dict[str, DestinoDelCriterio]] | None = None,
    ) -> None:
        self._etiquetas_por_tipo = {
            tipo: MappingProxyType(dict(datos)) for tipo, datos in etiquetas_por_tipo.items()
        }
        self._fuentes_por_tipo = {
            tipo: MappingProxyType(dict(datos)) for tipo, datos in (fuentes_por_tipo or {}).items()
        }
        self._destinos_por_tipo = {
            tipo: MappingProxyType(dict(datos)) for tipo, datos in (destinos_por_tipo or {}).items()
        }

    def etiquetas(self, tipo_de_cancer: str) -> Mapping[str, str]:
        return self._etiquetas_por_tipo.get(tipo_de_cancer, _SIN_DATOS)

    def tipos_de_documento(self, tipo_de_cancer: str) -> Mapping[str, tuple[str, ...]]:
        return self._fuentes_por_tipo.get(tipo_de_cancer, _SIN_FUENTES)

    def destinos(self, tipo_de_cancer: str) -> Mapping[str, DestinoDelCriterio]:
        """Clave del dato crítico → su ``destination`` del catálogo (RN-29); vacío si el tipo no está en el catálogo."""
        return self._destinos_por_tipo.get(tipo_de_cancer, _SIN_DESTINOS)


def cargar_datos_criticos(
    catalogos: Path, tipos_de_cancer: Sequence[str]
) -> DatosCriticosDelCatalogo:
    """Lee una vez ``<catálogos>/<tipo>/datos-criticos.json`` de cada tipo del manifiesto.

    Un tipo que no sea ``^[a-z]+$`` (p. ej. ``..``) no es un directorio del catálogo: ``CatalogoNoDisponible``."""
    if not all(re.fullmatch(_TIPO_DE_CANCER, tipo) for tipo in tipos_de_cancer):
        raise CatalogoNoDisponible("el manifiesto declara un tipo de cáncer inválido")
    items_por_tipo = {
        tipo: _leer_items_del_tipo(catalogos / tipo / NOMBRE_DEL_ARCHIVO, tipo)
        for tipo in tipos_de_cancer
    }
    return DatosCriticosDelCatalogo(
        {
            tipo: {item.key: item.label.es for item in items}
            for tipo, items in items_por_tipo.items()
        },
        {
            tipo: {item.key: tuple(item.sourceDocumentTypes) for item in items}
            for tipo, items in items_por_tipo.items()
        },
        {
            tipo: {item.key: _destino_del_dominio(item.destination) for item in items}
            for tipo, items in items_por_tipo.items()
        },
    )


def _destino_del_dominio(destino: _Destino) -> DestinoDelCriterio:
    return DestinoDelCriterio(
        entidad=destino.entity,
        campo=destino.field,
        coincidencia=MappingProxyType(
            {
                nombre: (valor,) if isinstance(valor, str) else tuple(valor)
                for nombre, valor in destino.match.items()
            }
        ),
    )


def _leer_items_del_tipo(archivo: Path, tipo: str) -> list[_DatoCritico]:
    try:
        contenido = _Archivo.model_validate(json.loads(archivo.read_text(encoding="utf-8")))
    except (OSError, ValueError, ValidationError):  # JSON ilegible o fuera de esquema
        raise CatalogoNoDisponible(
            "datos-criticos.json no está disponible o no cumple su esquema"
        ) from None
    if any(item.cancerType != tipo for item in contenido.items):
        raise CatalogoNoDisponible("datos-criticos.json declara un dato de otro tipo de cáncer")
    return contenido.items
