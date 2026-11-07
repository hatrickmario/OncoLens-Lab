"""Adapter de ``DatosDeRelevancia`` sobre el catálogo clínico montado (US-264, RN-29): une, por tipo de cáncer, los datos
críticos (con su destino), los criterios de aplicabilidad y los sinónimos que ya leen sus propios adapters.

Solo lectura y una vez al arrancar (``CLINICAL_CATALOG_PATH``). No relee archivos por su cuenta: compone los tres
lectores existentes, así que un archivo ilegible falla cerrado con ``CatalogoNoDisponible`` y sin ruta ni contenido.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from types import MappingProxyType

from app.domain.chat.relevancia import DatoCritico
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad, CriteriosDeAplicabilidad
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from app.infrastructure.catalogo_clinico.datos_criticos import (
    DatosCriticosDelCatalogo,
    cargar_datos_criticos,
)
from app.infrastructure.catalogo_clinico.sinonimos import cargar_sinonimos

_SIN_SINONIMOS: Mapping[str, str] = MappingProxyType({})


class DatosDeRelevanciaDelCatalogo:
    """Implementa ``DatosDeRelevancia`` sobre los datos ya leídos."""

    def __init__(
        self,
        datos_criticos: DatosCriticosDelCatalogo,
        criterios: CriteriosDeAplicabilidad,
        sinonimos_por_tipo: Mapping[str, Mapping[str, str]],
    ) -> None:
        self._datos_criticos = datos_criticos
        self._criterios = criterios
        self._sinonimos_por_tipo = sinonimos_por_tipo

    def datos_criticos(self, tipo_de_cancer: str) -> tuple[DatoCritico, ...]:
        destinos = self._datos_criticos.destinos(tipo_de_cancer)
        return tuple(
            DatoCritico(clave, etiqueta, destinos[clave])
            for clave, etiqueta in self._datos_criticos.etiquetas(tipo_de_cancer).items()
        )

    def criterios(self, tipo_de_cancer: str) -> tuple[CriterioDeAplicabilidad, ...]:
        return self._criterios.criterios(tipo_de_cancer)

    def sinonimos(self, tipo_de_cancer: str) -> Mapping[str, str]:
        return self._sinonimos_por_tipo.get(tipo_de_cancer, _SIN_SINONIMOS)


def cargar_datos_de_relevancia(
    catalogos: Path, tipos_de_cancer: Sequence[str]
) -> DatosDeRelevanciaDelCatalogo:
    """Lee una vez los tres archivos de cada tipo del manifiesto; un archivo ilegible lanza ``CatalogoNoDisponible``."""
    return DatosDeRelevanciaDelCatalogo(
        cargar_datos_criticos(catalogos, tipos_de_cancer),
        cargar_criterios_de_aplicabilidad(catalogos, tuple(tipos_de_cancer)),
        {tipo: cargar_sinonimos(catalogos, [tipo]) for tipo in tipos_de_cancer},
    )
