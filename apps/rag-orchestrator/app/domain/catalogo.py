"""Versión del catálogo clínico entre servicios (NFR-14, US-041): regla pura, sin I/O."""


class CatalogVersionMismatchError(Exception):
    """La versión de catálogo de la solicitud difiere de la montada aquí (`409 CATALOG_VERSION_MISMATCH`).

    El mensaje no lleva ninguna de las dos versiones: la ajena no se refleja más allá de lo que declara el contrato.
    """


def exigir_misma_version_de_catalogo(solicitada: str, montada: str) -> None:
    """Lanza ``CatalogVersionMismatchError`` si ``solicitada`` no es exactamente la versión ``montada``."""
    if solicitada != montada:
        raise CatalogVersionMismatchError("el catálogo clínico es de otra versión")
