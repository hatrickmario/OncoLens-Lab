"""El dataset de la suite y el lector del dominio ven las mismas claves de población (US-244, Gate 2 P1-3).

``claves_declaradas`` (evaluación) comparte con ``poblacion_desde_lo_guardado`` (dominio) qué es una hoja de
``population_criteria``: la marca ``pendiente`` y la forma antigua con subclaves cuentan igual en los dos.
"""

import json
from pathlib import Path

from app.config.settings import POBLACION_MAX_VALORES_POR_CRITERIO_INICIAL
from app.domain.poblacion_del_estudio import poblacion_desde_lo_guardado
from app.evaluation.dataset_aplicabilidad import claves_declaradas

RAIZ = Path(__file__).resolve().parents[4]
DOC_A2 = RAIZ / "data" / "evaluation" / "aplicabilidad" / "fuentes" / "doc-a2.json"


def test_claves_declaradas_coinciden_con_las_hojas_con_marca_o_valores_del_lector_cuando_se_lee_doc_a2():
    fuente = json.loads(DOC_A2.read_text(encoding="utf-8"))

    poblacion = poblacion_desde_lo_guardado(
        fuente["metadata_source"],
        fuente["population_criteria"],
        POBLACION_MAX_VALORES_POR_CRITERIO_INICIAL,
    )

    del_lector = {c for c, v in poblacion.criterios.items() if v.pendiente or v.valores}
    assert set(claves_declaradas(fuente["population_criteria"])) == del_lector
    assert "biomarcadores.her2" in del_lector
