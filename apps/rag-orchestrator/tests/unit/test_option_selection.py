"""Recorte a `maxOptions` (FR-09, RN-28) y relevancia de la opción (RN-03): reglas puras, sin adapters."""

from dataclasses import replace

import pytest

from app.domain.aplicabilidad_tipos import ResumenDeEstados
from app.domain.applicability_aggregation import (
    FuenteDeLaOpcion,
    agregar_aplicabilidad_de_opcion,
)
from app.domain.citations import OpcionAceptada, OpcionGenerada
from app.domain.option_selection import OpcionConRelevancia, recortar_a_max_opciones
from app.domain.relevance import relevancia_de_opcion


def _validada(nombre: str, puntaje: float, principal: str) -> OpcionConRelevancia:
    generada = OpcionGenerada(nombre, "razón", (principal,))
    return OpcionConRelevancia(OpcionAceptada(generada, (principal,)), puntaje, principal)


def _nombres(opciones) -> list[str]:
    return [o.aceptada.opcion.option for o in opciones]


def test_recortar_devuelve_lista_vacia_cuando_no_hay_opciones():
    assert recortar_a_max_opciones([], 3) == ()


def test_recortar_conserva_todas_ordenadas_por_relevancia_cuando_hay_menos_que_el_maximo():
    opciones = [_validada("baja", 0.4, "ch-a"), _validada("alta", 0.9, "ch-b")]

    assert _nombres(recortar_a_max_opciones(opciones, 3)) == ["alta", "baja"]


def test_recortar_conserva_las_de_mayor_relevancia_cuando_hay_mas_que_el_maximo():
    opciones = [
        _validada("media", 0.6, "ch-a"),
        _validada("alta", 0.9, "ch-b"),
        _validada("baja", 0.3, "ch-c"),
    ]

    assert _nombres(recortar_a_max_opciones(opciones, 2)) == ["alta", "media"]


@pytest.mark.parametrize("orden", [("ch-b", "ch-a"), ("ch-a", "ch-b")])
def test_recortar_desempata_por_chunk_id_de_la_cita_principal_sin_importar_el_orden_de_aparicion(
    orden,
):
    opciones = [_validada(f"opcion-{chunk}", 0.6, chunk) for chunk in orden]

    assert _nombres(recortar_a_max_opciones(opciones, 1)) == ["opcion-ch-a"]


def test_recortar_no_devuelve_el_excedente_como_descartado():
    opciones = [_validada("alta", 0.9, "ch-a"), _validada("baja", 0.3, "ch-b")]

    recortadas = recortar_a_max_opciones(opciones, 1)

    assert len(recortadas) == 1


def _con_aplicabilidad(
    nombre: str, puntaje: float, principal: str, *, excluyentes: int, coincide: int
) -> OpcionConRelevancia:
    resumen = ResumenDeEstados(coincide=coincide, parcial=0, no_coincide=excluyentes, desconocido=0)
    fuente = FuenteDeLaOpcion(f"CDR-{principal}", resumen, excluyentes, excluyentes > 0, puntaje)
    return replace(
        _validada(nombre, puntaje, principal),
        aplicabilidad=agregar_aplicabilidad_de_opcion([fuente]),
    )


def test_recortar_conserva_la_menos_excluyente_aunque_sea_menos_relevante_cuando_hay_aplicabilidad():
    opciones = [
        _con_aplicabilidad("relevante", 0.92, "ch-a", excluyentes=1, coincide=2),
        _con_aplicabilidad("aplicable", 0.70, "ch-b", excluyentes=0, coincide=2),
    ]

    assert _nombres(recortar_a_max_opciones(opciones, 1)) == ["aplicable"]


def test_recortar_prefiere_mas_coincide_y_despues_relevancia_cuando_empatan_los_excluyentes():
    opciones = [
        _con_aplicabilidad("poco-coincide", 0.95, "ch-a", excluyentes=0, coincide=1),
        _con_aplicabilidad("mucho-coincide", 0.40, "ch-b", excluyentes=0, coincide=3),
        _con_aplicabilidad("mucho-coincide-relevante", 0.60, "ch-c", excluyentes=0, coincide=3),
    ]

    assert _nombres(recortar_a_max_opciones(opciones, 2)) == [
        "mucho-coincide-relevante",
        "mucho-coincide",
    ]


def test_relevancia_de_opcion_es_la_de_la_cita_mas_relevante():
    relevancia = relevancia_de_opcion(("ch-inj-1", "ch-m1-1"), {"ch-inj-1": 0.4, "ch-m1-1": 0.87})

    assert relevancia.relevance_score == 0.87
    assert relevancia.chunk_principal_id == "ch-m1-1"


def test_relevancia_de_opcion_desempata_por_chunk_id_ascendente_cuando_las_citas_empatan():
    relevancia = relevancia_de_opcion(("ch-b", "ch-a"), {"ch-a": 0.5, "ch-b": 0.5})

    assert relevancia.chunk_principal_id == "ch-a"
