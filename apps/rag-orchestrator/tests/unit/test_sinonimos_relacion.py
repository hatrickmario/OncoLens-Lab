"""Regla S-1 de US-277: solo una relación ``equivalente`` equipara un texto con su término canónico."""

import pytest

from app.domain.sinonimos import RelacionDeSinonimo, es_equivalente


def test_es_equivalente_cuando_la_relacion_es_equivalente() -> None:
    assert es_equivalente(RelacionDeSinonimo.equivalente) is True


@pytest.mark.parametrize(
    "relacion", [RelacionDeSinonimo.miembro_de_clase, RelacionDeSinonimo.mas_amplio]
)
def test_no_es_equivalente_cuando_el_texto_es_mas_estrecho_o_mas_amplio_que_el_canonico(
    relacion: RelacionDeSinonimo,
) -> None:
    assert es_equivalente(relacion) is False


def test_la_relacion_se_lee_por_su_valor_del_catalogo_y_una_desconocida_falla() -> None:
    assert RelacionDeSinonimo("miembro_de_clase") is RelacionDeSinonimo.miembro_de_clase
    with pytest.raises(ValueError):
        RelacionDeSinonimo("relacionado")
