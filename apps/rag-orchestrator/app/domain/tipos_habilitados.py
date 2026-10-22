"""Tipos de cáncer habilitados (RN-20, B-10, US-043): reglas puras, sin I/O."""

from collections.abc import Collection, Iterable


class TipoNoHabilitadoError(Exception):
    """El tipo de cáncer del caso no está en `ENABLED_CANCER_TYPES` (`422 TIPO_NO_HABILITADO`).

    El mensaje no lleva el tipo recibido: el contrato no lo refleja (RN-10).
    """


def exigir_tipo_habilitado(tipo: str, habilitados: Collection[str]) -> None:
    """Lanza ``TipoNoHabilitadoError`` si ``tipo`` no está exactamente entre los habilitados (lista vacía: ninguno)."""
    if tipo not in habilitados:
        raise TipoNoHabilitadoError("el tipo de cáncer no está habilitado en este entorno")


def tipos_ausentes_del_catalogo(
    habilitados: Iterable[str], del_catalogo: Collection[str]
) -> list[str]:
    """Los tipos habilitados que el manifiesto del catálogo no declara (`ENABLED_CANCER_TYPES` inválida)."""
    return [tipo for tipo in habilitados if tipo not in del_catalogo]
