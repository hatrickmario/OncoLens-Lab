"""Adapter de ``EtiquetasDeDatosCriticos`` sobre ``datos-criticos.json`` del catálogo montado (US-116 / L1D-113).

Solo lectura y una vez al arrancar (``CLINICAL_CATALOG_PATH``): de cada tipo del manifiesto se toman la clave y la
etiqueta en español de cada dato crítico. El resto del archivo (destino, ``minValues``, revisión) lo hace cumplir el
validador del catálogo en la CI. Un archivo ausente, ilegible o fuera de esquema deja el catálogo no disponible
(falla cerrado); los mensajes nunca llevan la ruta ni el contenido del archivo.
"""

import json
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from types import MappingProxyType
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible

NOMBRE_DEL_ARCHIVO = "datos-criticos.json"

# Patrones idénticos a ``comun.schema.json``: la clave es ``^[a-z0-9_]+$`` y el tipo ``^[a-z]+$``.
_CLAVE = r"^[a-z0-9_]+$"
_TIPO_DE_CANCER = r"^[a-z]+$"


class _Etiqueta(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    es: Annotated[str, Field(min_length=1)]


class _DatoCritico(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    key: str = Field(pattern=_CLAVE)
    cancerType: str = Field(pattern=_TIPO_DE_CANCER)
    label: _Etiqueta


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


class DatosCriticosDelCatalogo:
    """Implementa ``EtiquetasDeDatosCriticos`` sobre las etiquetas ya leídas."""

    def __init__(self, etiquetas_por_tipo: dict[str, dict[str, str]]) -> None:
        self._etiquetas_por_tipo = {
            tipo: MappingProxyType(dict(datos)) for tipo, datos in etiquetas_por_tipo.items()
        }

    def etiquetas(self, tipo_de_cancer: str) -> Mapping[str, str]:
        return self._etiquetas_por_tipo.get(tipo_de_cancer, _SIN_DATOS)

    def tipos_de_documento(self, tipo_de_cancer: str) -> Mapping[str, tuple[str, ...]]:
        raise NotImplementedError("no implementado")


def cargar_datos_criticos(
    catalogos: Path, tipos_de_cancer: Sequence[str]
) -> DatosCriticosDelCatalogo:
    """Lee una vez ``<catálogos>/<tipo>/datos-criticos.json`` de cada tipo del manifiesto.

    Un tipo que no sea ``^[a-z]+$`` (p. ej. ``..``) no es un directorio del catálogo: ``CatalogoNoDisponible``."""
    if not all(re.fullmatch(_TIPO_DE_CANCER, tipo) for tipo in tipos_de_cancer):
        raise CatalogoNoDisponible("el manifiesto declara un tipo de cáncer inválido")
    return DatosCriticosDelCatalogo(
        {
            tipo: _leer_etiquetas_del_tipo(catalogos / tipo / NOMBRE_DEL_ARCHIVO, tipo)
            for tipo in tipos_de_cancer
        }
    )


def _leer_etiquetas_del_tipo(archivo: Path, tipo: str) -> dict[str, str]:
    try:
        contenido = _Archivo.model_validate(json.loads(archivo.read_text(encoding="utf-8")))
    except (OSError, ValueError, ValidationError):  # JSON ilegible o fuera de esquema
        raise CatalogoNoDisponible(
            "datos-criticos.json no está disponible o no cumple su esquema"
        ) from None
    if any(item.cancerType != tipo for item in contenido.items):
        raise CatalogoNoDisponible("datos-criticos.json declara un dato de otro tipo de cáncer")
    return {item.key: item.label.es for item in contenido.items}
