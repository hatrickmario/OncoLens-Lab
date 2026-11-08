"""``terminos_del_caso`` (US-271, ADR-52, RN-27, RN-10, RN-11): reglas puras sobre el catálogo versionado, sin adapters.

Las dos formas de entrada del fixture compartido ``temas-del-caso.json`` (``clinicalContext`` de Backend 2 y
``PatientSummary`` del panel) dan la misma salida; el resto de los casos usa un catálogo mínimo de prueba.
"""

from dataclasses import replace

import pytest

from app.domain.terminos_del_caso import (
    BiomarcadorDelCatalogo,
    CasoParaTerminos,
    CatalogoDeTerminos,
    TerminosDelCaso,
    terminos_del_caso,
)
from tests.support.expansion_contextual import (
    CATALOGO_DE_TERMINOS,
    caso_desde_contexto_clinico,
    caso_desde_resumen_del_paciente,
    casos_del_fixture,
)

TODOS = ("tipo", "estadio", "biomarcador_principal")

CATALOGO = CatalogoDeTerminos(
    etiqueta_de_tipo={"mama": "Cáncer de mama"},
    estadios={"mama": {"tnm 8": {"iia": "IIA", "iib": "IIB"}}},
    grados={"mama": ("ISUP 3", "ISUP 30")},
    biomarcadores={
        "mama": (
            BiomarcadorDelCatalogo("re", "Receptor de estrógeno", {"positivo": "positivo"}),
            BiomarcadorDelCatalogo("her2", "HER2", {"3": "3+", "positivo": "positivo"}),
        )
    },
)
CASO = CasoParaTerminos(
    tipo_de_cancer="mama",
    sistema_de_estadificacion="TNM_8",
    estadio="IIA",
    grado=None,
    biomarcadores=(("HER2", "3+"), ("RE", "positivo")),
)


@pytest.mark.parametrize("caso", casos_del_fixture(), ids=lambda c: c["id"])
def test_terminos_salen_iguales_cuando_la_entrada_es_el_contexto_clinico_o_el_resumen_del_paciente(
    caso,
):
    desde_contexto = terminos_del_caso(
        caso_desde_contexto_clinico(caso["clinicalContext"]), CATALOGO_DE_TERMINOS, TODOS
    )
    desde_resumen = terminos_del_caso(
        caso_desde_resumen_del_paciente(caso["patientSummary"]), CATALOGO_DE_TERMINOS, TODOS
    )

    esperado = TerminosDelCaso(tuple(caso["salida"]["terminos"]), tuple(caso["salida"]["campos"]))
    assert desde_contexto == esperado
    assert desde_resumen == esperado


def test_terminos_ponen_tipo_estadio_y_biomarcador_en_ese_orden_cuando_el_caso_los_tiene():
    resultado = terminos_del_caso(CASO, CATALOGO, TODOS)

    assert resultado.terminos == ("Cáncer de mama", "IIA", "Receptor de estrógeno", "positivo")
    assert resultado.campos == TODOS


def test_terminos_toman_el_biomarcador_principal_por_el_orden_del_catalogo_y_no_por_el_del_contexto():
    solo_her2 = replace(CASO, biomarcadores=(("HER2", "3+"),))

    assert terminos_del_caso(solo_her2, CATALOGO, TODOS).terminos[-2:] == ("HER2", "3+")
    assert terminos_del_caso(CASO, CATALOGO, TODOS).terminos[-2] == "Receptor de estrógeno"


def test_terminos_usan_solo_los_campos_pedidos_cuando_la_configuracion_los_acota():
    resultado = terminos_del_caso(CASO, CATALOGO, ("tipo",))

    assert resultado == TerminosDelCaso(("Cáncer de mama",), ("tipo",))


def test_terminos_declaran_los_campos_en_orden_canonico_cuando_la_configuracion_los_da_desordenados():
    resultado = terminos_del_caso(CASO, CATALOGO, ("biomarcador_principal", "tipo"))

    assert resultado.campos == ("tipo", "biomarcador_principal")


def test_terminos_descartan_el_estadio_cuando_no_esta_en_el_catalogo():
    resultado = terminos_del_caso(replace(CASO, estadio="Sin estadificar"), CATALOGO, TODOS)

    assert "estadio" not in resultado.campos
    assert "Sin estadificar" not in resultado.terminos


def test_terminos_descartan_el_estadio_cuando_el_sistema_de_estadificacion_no_es_el_del_catalogo():
    resultado = terminos_del_caso(replace(CASO, sistema_de_estadificacion="OTRO"), CATALOGO, TODOS)

    assert "IIA" not in resultado.terminos


def test_terminos_dejan_solo_el_nombre_del_biomarcador_cuando_su_valor_no_es_del_catalogo():
    resultado = terminos_del_caso(
        replace(CASO, biomarcadores=(("HER2", "3+ (IHQ) SENTINELA"),)), CATALOGO, TODOS
    )

    assert resultado.terminos == ("Cáncer de mama", "IIA", "HER2")


def test_terminos_omiten_el_biomarcador_cuando_el_contexto_no_trae_ninguno_del_catalogo():
    resultado = terminos_del_caso(
        replace(CASO, biomarcadores=(("BCR-ABL", "positivo"),)), CATALOGO, TODOS
    )

    assert resultado.campos == ("tipo", "estadio")


def test_terminos_agregan_el_grado_bajo_estadio_cuando_el_texto_del_grado_contiene_un_valor_del_catalogo():
    caso = replace(CASO, grado="Gleason 4+3=7 · ISUP 3", biomarcadores=())

    resultado = terminos_del_caso(caso, CATALOGO, TODOS)

    assert resultado.terminos == ("Cáncer de mama", "IIA", "ISUP 3")
    assert resultado.campos == ("tipo", "estadio")


def test_terminos_no_confunden_un_grado_con_otro_cuando_uno_es_prefijo_del_otro():
    caso = replace(CASO, estadio="XX", grado="Gleason ISUP 35", biomarcadores=())

    assert terminos_del_caso(caso, CATALOGO, TODOS).terminos == ("Cáncer de mama",)


def test_terminos_devuelven_tupla_vacia_cuando_el_caso_no_aporta_nada_del_catalogo():
    caso = CasoParaTerminos("leucemia", "TNM_8", "IV", None, (("BCR-ABL", "positivo"),))

    assert terminos_del_caso(caso, CATALOGO, TODOS) == TerminosDelCaso((), ())


def test_terminos_ignoran_texto_libre_del_caso_cuando_no_es_un_valor_del_catalogo():
    caso = replace(
        CASO, estadio="paciente Juan Pérez 2026-01-02", biomarcadores=(("HER2", "psd_Ab12"),)
    )

    resultado = terminos_del_caso(caso, CATALOGO, TODOS)

    assert resultado.terminos == ("Cáncer de mama", "HER2")


@pytest.mark.ac("US-273", 1)
def test_terminos_saltan_el_biomarcador_no_anclable_del_tipo_y_toman_el_siguiente_del_catalogo():
    catalogo = replace(CATALOGO, biomarcadores_no_anclables={"mama": frozenset({"re"})})

    resultado = terminos_del_caso(CASO, catalogo, TODOS)

    assert resultado.terminos == ("Cáncer de mama", "IIA", "HER2", "3+")
    assert resultado.campos == TODOS


def test_terminos_omiten_el_campo_biomarcador_cuando_el_unico_biomarcador_del_caso_es_no_anclable():
    catalogo = replace(CATALOGO, biomarcadores_no_anclables={"mama": frozenset({"re"})})
    solo_re = replace(CASO, biomarcadores=(("RE", "positivo"),))

    resultado = terminos_del_caso(solo_re, catalogo, TODOS)

    assert resultado == TerminosDelCaso(("Cáncer de mama", "IIA"), ("tipo", "estadio"))


@pytest.mark.ac("US-273", 5)
def test_terminos_no_cambian_cuando_la_lista_de_no_anclables_es_de_otro_tipo():
    catalogo = replace(CATALOGO, biomarcadores_no_anclables={"prostata": frozenset({"re"})})

    assert terminos_del_caso(CASO, catalogo, TODOS) == terminos_del_caso(CASO, CATALOGO, TODOS)
