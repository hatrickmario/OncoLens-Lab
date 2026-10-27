"""Humo de FX-08b-b (L1D-130, tarea 2.1): puntajes, población de doc-a6 y salidas de los LLM falsos."""

import asyncio

from tests.support.aplicabilidad import (
    ESCENARIOS_FX08BB,
    POBLACIONES_FX08BA,
    POBLACIONES_FX08BB,
    RELEVANCIAS_FX08BB,
    GeneradorDeDosOpciones,
)


def test_fixture_fx08bb_usa_los_puntajes_del_reranker_falso_cuando_se_arma_el_corpus():
    assert RELEVANCIAS_FX08BB == {"doc-a4": 0.92, "doc-a1": 0.70, "doc-a6": 0.60}


def test_fixture_fx08bb_da_a_doc_a6_la_poblacion_estructurada_de_doc_a1_sin_tocar_fx08ba():
    assert POBLACIONES_FX08BB["doc-a6"].criterios == POBLACIONES_FX08BA["doc-a1"].criterios
    assert POBLACIONES_FX08BB["doc-a6"].metadata_source == "fuente_estructurada"
    assert POBLACIONES_FX08BA["doc-a6"].metadata_source == "pendiente"


def test_fixture_fx08bb_emite_dos_opciones_en_el_orden_del_escenario_cuando_se_genera():
    for escenario, esperadas in ESCENARIOS_FX08BB.items():
        generador = GeneradorDeDosOpciones(escenario)
        evidencia = asyncio.run(generador.generar(None, None))  # type: ignore[arg-type]

        assert [o.option for o in evidencia.opciones] == [e[0] for e in esperadas]
        assert [o.chunk_ids_citados for o in evidencia.opciones] == [
            (f"ch-{e[2].removeprefix('doc-')}-1",) for e in esperadas
        ]
