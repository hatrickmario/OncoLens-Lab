"""Comparador de aplicabilidad de RN-28 (US-125 AC-4, ADR-27): función pura con tabla de casos, sin puntaje combinado."""

import itertools
from dataclasses import dataclass

import pytest

from app.domain.aplicabilidad_tipos import CriterioEvaluado
from app.domain.applicability_order import clave_de_aplicabilidad, contar_excluyentes_no_coincide


@dataclass(frozen=True)
class Candidata:
    id: str
    excluyentes: int
    coincide: int
    relevancia: float

    @property
    def clave(self) -> tuple[int, int, float, str]:
        return clave_de_aplicabilidad(self.excluyentes, self.coincide, self.relevancia, self.id)


def _ganadora(*candidatas: Candidata) -> str:
    return min(candidatas, key=lambda c: c.clave).id


TABLA = [
    ("a_excluyentes", Candidata("x", 0, 2, 0.50), Candidata("y", 1, 2, 0.95), "x"),
    ("b_coincide", Candidata("x", 0, 3, 0.40), Candidata("y", 0, 2, 0.90), "x"),
    ("c_relevancia", Candidata("x", 0, 2, 0.70), Candidata("y", 0, 2, 0.60), "x"),
    ("d_identificador", Candidata("b", 0, 2, 0.70), Candidata("a", 0, 2, 0.70), "a"),
]


@pytest.mark.ac("US-125", 4)
@pytest.mark.parametrize(("caso", "una", "otra", "gana"), TABLA, ids=[t[0] for t in TABLA])
def test_clave_de_aplicabilidad_ordena_igual_en_ambos_ordenes_de_entrada_cuando_se_evalua_la_tabla(
    caso, una, otra, gana
):
    for orden in itertools.permutations((una, otra)):
        assert _ganadora(*orden) == gana


@pytest.mark.ac("US-125", 4)
def test_clave_de_aplicabilidad_no_combina_conteos_y_relevancia_en_un_puntaje_cuando_una_suma_ponderada_invertiria_el_orden():
    sin_excluyentes = Candidata("x", 0, 0, 0.10)
    con_excluyente = Candidata("y", 1, 5, 0.99)

    assert _ganadora(sin_excluyentes, con_excluyente) == "x"
    assert sin_excluyentes.clave == (0, 0, -0.10, "x")
    assert all(isinstance(parte, (int, float, str)) for parte in sin_excluyentes.clave)
    assert len(sin_excluyentes.clave) == 4


def _criterio(estado: str, *, excluyente: bool) -> CriterioEvaluado:
    return CriterioEvaluado("c", None, None, estado, None, excluyente)  # type: ignore[arg-type]


def test_contar_excluyentes_no_coincide_ignora_los_no_excluyentes_y_los_otros_estados_cuando_hay_mezcla():
    criterios = [
        _criterio("no_coincide", excluyente=True),
        _criterio("no_coincide", excluyente=False),
        _criterio("desconocido", excluyente=True),
        _criterio("coincide", excluyente=True),
        _criterio("no_coincide", excluyente=True),
    ]

    assert contar_excluyentes_no_coincide(criterios) == 2
