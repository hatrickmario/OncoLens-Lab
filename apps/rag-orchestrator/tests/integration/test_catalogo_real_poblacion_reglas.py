"""D4-03 (L1D-297): el catálogo REAL de ``packages/clinical-catalogs`` trae ``poblacion-reglas.json``, de modo que el
estado «mezclada» aparece en producción y no solo con el fixture ``test-apl-1.2.0``. Sin E/S de red: lee el catálogo del
repo con los mismos cargadores que usa el servicio."""

from pathlib import Path

import pytest

from app.domain.aplicabilidad_tipos import ProyeccionDeEstado, ValorDePoblacion
from app.domain.applicability_rules import estado_de_poblacion
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from app.infrastructure.catalogo_clinico.manifiesto import cargar_catalogo_del_manifiesto

CATALOGO_REAL = Path(__file__).resolve().parents[4] / "packages" / "clinical-catalogs"


def _valores() -> list[ValorDePoblacion]:
    return [
        ValorDePoblacion("premenopausal women", "elegibilidad", "ch-1"),  # type: ignore[arg-type]
        ValorDePoblacion("postmenopausal women", "elegibilidad", "ch-1"),  # type: ignore[arg-type]
    ]


def _criterio_menopausia():
    catalogo = cargar_catalogo_del_manifiesto(CATALOGO_REAL)
    criterios = cargar_criterios_de_aplicabilidad(CATALOGO_REAL, catalogo.tipos_de_cancer())
    return next(c for c in criterios.criterios("mama") if c.clave == "estado_menopausico")


def test_catalogo_real_declara_la_version_1_2_0():
    assert cargar_catalogo_del_manifiesto(CATALOGO_REAL).version() == "1.2.0"


@pytest.mark.parametrize(
    ("diseno", "motivo"),
    [("guia", "mezclada"), ("revision_sistematica", "mezclada"), ("eca", "inclusiva")],
)
def test_estado_de_poblacion_distingue_mezclada_de_inclusiva_con_el_catalogo_real(diseno, motivo):
    proyeccion = estado_de_poblacion(
        _valores(), "posmenopáusica", _criterio_menopausia(), diseno_de_la_fuente=diseno
    )

    assert proyeccion == ProyeccionDeEstado("parcial", motivo_parcial=motivo)
