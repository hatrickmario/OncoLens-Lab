"""El vocabulario de dominio de la población en lista coincide con los enums generados del contrato (US-243)."""

from typing import get_args

from app.domain.aplicabilidad_tipos import CausaDeDesconocido, EstadoDeCriterio, MotivoParcial
from app.schemas.generated.models import ApplicabilityStatus, PartialReason, UnknownReason

RESERVADAS_O_DE_OTRO_CHANGE = {"varios_valores_en_la_fuente", "respaldo_fallido"}


def test_motivo_parcial_del_dominio_es_el_enum_partial_reason_del_contrato():
    assert set(get_args(MotivoParcial)) == {m.value for m in PartialReason if m.value}


def test_causa_de_desconocido_del_dominio_es_el_enum_unknown_reason_sin_las_reservadas():
    assert (
        set(get_args(CausaDeDesconocido))
        == {m.value for m in UnknownReason if m.value} - RESERVADAS_O_DE_OTRO_CHANGE
    )


def test_estado_de_criterio_del_dominio_es_el_enum_applicability_status_del_contrato():
    assert set(get_args(EstadoDeCriterio)) == {m.value for m in ApplicabilityStatus}
