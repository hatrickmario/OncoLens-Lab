"""Las copias de preguntas de los tests coinciden con su fuente de verdad en ``data/eval`` (US-271, L1D-329).

El contenedor del job ``integration-rag`` solo ve ``apps/rag-orchestrator``, así que los tests leen una copia en
``tests/fixtures/expansion_contextual``. Donde ``data/eval`` está disponible (CI de unitarios y local) la copia debe ser
idéntica; en el contenedor la fuente no existe y no hay nada que comparar (el dataset lo versiona la rama, no el contenedor).
"""

import yaml

from tests.support.expansion_contextual import DATASET, FIXTURES


def _yaml(ruta):
    return yaml.safe_load(ruta.read_text("utf-8"))


def test_la_copia_de_las_60_preguntas_coincide_con_el_dataset_cuando_la_fuente_esta_disponible():
    fuente = DATASET / "preguntas-contextuales.yaml"
    if fuente.exists():
        assert _yaml(FIXTURES / "preguntas-contextuales.yaml") == _yaml(fuente)


def test_la_copia_de_las_69_preguntas_de_s5_coincide_con_el_dataset_cuando_la_fuente_esta_disponible():
    fuente = DATASET / "preguntas.yaml"
    if fuente.exists():
        esperadas = [p["pregunta"] for p in _yaml(fuente)["preguntas"]]
        assert _yaml(FIXTURES / "preguntas-s5.yaml")["preguntas"] == esperadas


def test_las_copias_traen_las_60_y_las_69_preguntas_aunque_la_fuente_no_este():
    assert len(_yaml(FIXTURES / "preguntas-contextuales.yaml")["preguntas"]) == 60
    assert len(_yaml(FIXTURES / "preguntas-s5.yaml")["preguntas"]) == 69
