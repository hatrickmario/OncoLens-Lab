"""El léxico versionado de marcos de pregunta frente a las preguntas de la medición (US-271 AC-8, ADR-52, RN-29).

El gate G1 (``pregunta_sin_tema_propio``) con el léxico real del catálogo: las 22 genéricas dan genérica y las 24 con tema,
los 14 controles y las 69 preguntas de ``s5-corpus-ampliado`` dan 0 genéricas. El idioma lo da el detector de producción.
"""

import pytest

from app.domain.idioma import detectar_idioma
from app.domain.pregunta_sin_tema_propio import pregunta_sin_tema_propio
from tests.support.expansion_contextual import (
    LEXICO,
    preguntas_de_la_medicion,
    preguntas_de_s5,
)

IDIOMA_POR_DEFECTO = "es"


def _es_generica(pregunta: str) -> bool:
    return pregunta_sin_tema_propio(
        pregunta, LEXICO, (detectar_idioma(pregunta, IDIOMA_POR_DEFECTO),)
    )


@pytest.mark.ac("US-271", 8)
def test_lexico_clasifica_las_60_preguntas_de_la_medicion_y_las_69_de_s5_cuando_se_aplica_el_gate():
    medicion = preguntas_de_la_medicion()
    genericas = [p for p in medicion if p["genericas"]]
    con_tema = [p for p in medicion if p["clase"] == "con_tema"]
    controles = [p for p in medicion if p["clase"] == "control"]

    assert (len(genericas), len(con_tema), len(controles)) == (22, 24, 14)
    assert [p["id"] for p in genericas if not _es_generica(p["pregunta"])] == []
    assert [p["id"] for p in con_tema + controles if _es_generica(p["pregunta"])] == []
    assert [q for q in preguntas_de_s5() if _es_generica(q)] == []
    assert len(preguntas_de_s5()) == 69


def test_lexico_tiene_las_listas_de_los_dos_idiomas_con_la_version_del_catalogo():
    assert set(LEXICO.por_idioma) == {"es", "en"}
    assert all(i.marcos and i.vacias for i in LEXICO.por_idioma.values())
    assert LEXICO.version == "1.8.0"
