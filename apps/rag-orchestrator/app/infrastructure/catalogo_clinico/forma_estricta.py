"""Base común de los espejos Pydantic de los archivos del catálogo (``aplicabilidad.json``, ``poblacion-reglas.json``).

Una sola definición de la forma estricta y de la marca ``revision_provisional`` (``comun.schema.json``): los dos lectores la
importan y el test de paridad con los esquemas JSON falla si alguno se vuelve más laxo que su esquema."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

FECHA = r"^\d{4}-\d{2}-\d{2}$"


class Estricto(BaseModel):
    # strict: ``"true"`` o ``1`` no son booleanos, ``"0"`` no es número (el esquema JSON también los rechaza).
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    @model_validator(mode="before")
    @classmethod
    def _rechazar_null_explicito(cls, datos: object) -> object:
        """El esquema JSON pide el campo opcional ausente, no ``null``: ``{"en": null}`` es inválido."""
        if isinstance(datos, dict) and any(valor is None for valor in datos.values()):
            raise ValueError("null explícito")
        return datos


class RevisionProvisional(Estricto):
    """Marca de procedencia de una revisión provisional de la IA (``comun.schema.json#/$defs/revisionProvisional``).

    Se valida en el borde y no llega al dominio: la lectura de la población no depende de quién revisó el criterio."""

    rol: Literal["ia"]
    fecha: str = Field(pattern=FECHA)
