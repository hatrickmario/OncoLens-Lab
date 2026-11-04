"""``CorpusCatalogReader`` falso de la familia `opciones`: fichas sintéticas y la población de cada documento (APL-FIJA).

Cumple el contrato del adapter real (LSP): solo devuelve los documentos que existen y la población en la forma que la
ingesta guarda (``poblacion_desde_lo_guardado``), incluida la marca ``pendiente``.
"""

from __future__ import annotations

from collections.abc import Collection, Mapping

from app.domain.aplicabilidad_tipos import PoblacionDelEstudio
from app.domain.citations import FichaDeFuente
from app.domain.poblacion_del_estudio import poblacion_desde_lo_guardado
from app.evaluation.adaptadores_falsos import CatalogoEnMemoria
from app.evaluation.dataset_opciones import PoblacionDeFuente
from app.evaluation.fuente_dataset import DatasetSuite


class CatalogoConPoblacion:
    def __init__(
        self,
        dataset: DatasetSuite,
        poblaciones: Mapping[str, PoblacionDeFuente],
        max_valores_de_poblacion: int,
    ) -> None:
        self._fichas = CatalogoEnMemoria(dataset)
        self._poblaciones = {
            documento: poblacion_desde_lo_guardado(
                fuente.metadata_source,  # type: ignore[arg-type]
                fuente.population_criteria,
                max_valores_de_poblacion,
            )
            for documento, fuente in poblaciones.items()
        }

    def fichas_por_documento(self, document_ids: Collection[str]) -> dict[str, FichaDeFuente]:
        return self._fichas.fichas_por_documento(document_ids)

    def poblacion_por_documento(
        self, document_ids: Collection[str]
    ) -> dict[str, PoblacionDelEstudio]:
        return {d: self._poblaciones[d] for d in document_ids if d in self._poblaciones}
