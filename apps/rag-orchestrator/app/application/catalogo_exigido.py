"""Exigir que la solicitud use el catálogo clínico montado aquí (NFR-14, US-041): primer paso de toda consulta."""

import logging

from app.application.ports import CatalogoClinico, EvidenceQueryPort
from app.domain.catalogo import CatalogVersionMismatchError, exigir_misma_version_de_catalogo
from app.schemas.generated.models import RagQueryInternalRequest, RagQueryInternalResponse

logger = logging.getLogger(__name__)


def exigir_catalogo_de_la_solicitud(
    catalogo: CatalogoClinico, trace_id: str, solicitada: str
) -> None:
    """Lanza ``CatalogVersionMismatchError`` si la versión difiere; el evento no lleva ninguna de las dos versiones."""
    try:
        exigir_misma_version_de_catalogo(solicitada, catalogo.version())
    except CatalogVersionMismatchError:
        logger.warning("event=catalog_version_mismatch traceId=%s", trace_id)
        raise


class ConsultaConCatalogoExigido:
    """Decorador de ``EvidenceQueryPort``: comprueba el catálogo antes de delegar (lo usa el modo ``fake``)."""

    def __init__(self, interna: EvidenceQueryPort, catalogo: CatalogoClinico) -> None:
        self._interna = interna
        self._catalogo = catalogo

    async def consultar(self, solicitud: RagQueryInternalRequest) -> RagQueryInternalResponse:
        exigir_catalogo_de_la_solicitud(
            self._catalogo, solicitud.traceId.root, solicitud.catalogVersion
        )
        return await self._interna.consultar(solicitud)
