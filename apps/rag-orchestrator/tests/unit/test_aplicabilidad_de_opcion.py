"""Agregación de la aplicabilidad por opción (US-125 AC-1…AC-3, ADR-31, RN-28): regla pura, sin adapters."""

import pytest

from app.domain.aplicabilidad_tipos import ResumenDeEstados
from app.domain.applicability_aggregation import (
    AVISO_POBLACION_NO_COMPARABLE,
    FuenteDeLaOpcion,
    agregar_aplicabilidad_de_opcion,
)

RESUMEN_COMPARABLE = ResumenDeEstados(coincide=2, parcial=0, no_coincide=0, desconocido=3)
RESUMEN_NO_COMPARABLE = ResumenDeEstados(coincide=0, parcial=0, no_coincide=1, desconocido=4)


def _fuente(
    externo: str,
    resumen: ResumenDeEstados = RESUMEN_COMPARABLE,
    *,
    excluyentes: int = 0,
    relevancia: float = 0.70,
) -> FuenteDeLaOpcion:
    return FuenteDeLaOpcion(externo, resumen, excluyentes, excluyentes > 0, relevancia)


@pytest.mark.ac("US-125", 1)
def test_agregar_hereda_el_resumen_de_doc_a1_y_lista_ambas_fuentes_cuando_la_opcion_cita_doc_a1_y_doc_a2():
    doc_a1 = _fuente("CDR-TEST-A1")
    doc_a2 = _fuente("CDR-TEST-A2", RESUMEN_NO_COMPARABLE, excluyentes=1, relevancia=0.95)

    agregada = agregar_aplicabilidad_de_opcion([doc_a2, doc_a1])

    assert agregada.resumen == doc_a1.resumen
    assert {f.external_id: (f.resumen, f.poblacion_no_comparable) for f in agregada.por_fuente} == {
        "CDR-TEST-A1": (RESUMEN_COMPARABLE, False),
        "CDR-TEST-A2": (RESUMEN_NO_COMPARABLE, True),
    }
    assert agregada.poblacion_no_comparable is False
    assert AVISO_POBLACION_NO_COMPARABLE not in agregada.avisos


@pytest.mark.ac("US-125", 2)
def test_agregar_marca_poblacion_no_comparable_y_el_aviso_una_vez_cuando_todas_las_fuentes_tienen_un_excluyente_en_no_coincide():
    fuentes = [
        _fuente("CDR-TEST-A4", RESUMEN_NO_COMPARABLE, excluyentes=1),
        _fuente("CDR-TEST-A2", RESUMEN_NO_COMPARABLE, excluyentes=1, relevancia=0.60),
    ]

    agregada = agregar_aplicabilidad_de_opcion(fuentes)

    assert agregada.poblacion_no_comparable is True
    assert agregada.avisos == (AVISO_POBLACION_NO_COMPARABLE,)


@pytest.mark.ac("US-125", 3)
def test_agregar_elige_la_fuente_de_mayor_relevancia_cuando_dos_fuentes_empatan_en_conteos():
    menos_relevante = _fuente("CDR-TEST-A1", relevancia=0.60)
    mas_relevante = _fuente("CDR-TEST-A6", RESUMEN_COMPARABLE, relevancia=0.70)

    agregada = agregar_aplicabilidad_de_opcion([menos_relevante, mas_relevante])

    assert agregada.por_fuente[0].external_id == "CDR-TEST-A6"
    assert {f.external_id for f in agregada.por_fuente} == {"CDR-TEST-A1", "CDR-TEST-A6"}
