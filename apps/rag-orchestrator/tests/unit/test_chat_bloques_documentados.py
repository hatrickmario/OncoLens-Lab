"""Bloques ``documentado`` del chat (US-261 AC-1, ADR-34): el código escribe el texto, el LLM solo elige los hechos."""

import pytest

from app.domain.chat.bloques_documentados import bloques_documentados
from app.domain.chat.descripcion_de_hechos import describir_hecho
from app.domain.chat.turno import BloqueDelTurno, HechoDelCaso, TipoDeBloque


def _hecho(ref: str, verbalizacion: str, dia: int | None) -> HechoDelCaso:
    return HechoDelCaso(ref, verbalizacion, dia, "verificado")


HECHOS = (
    _hecho("f1", "Diagnóstico", 0),
    _hecho("f2", "Quimioterapia", -160),
    _hecho("f3", "Cirugía", -40),
    _hecho("f4", "Control sin fecha", None),
    _hecho("f5", "Control del mismo día", 0),
)


def test_bloques_documentados_inserta_la_descripcion_del_hecho_cuando_el_llm_elige_un_factref():
    (bloque,) = bloques_documentados(("f3",), HECHOS)

    assert bloque == BloqueDelTurno(TipoDeBloque.documentado, describir_hecho(HECHOS[2]), ("f3",))
    assert bloque.texto == "Cirugía, 40 días antes del diagnóstico."


def test_bloques_documentados_emite_un_bloque_por_hecho_en_orden_ascendente_de_dia_cuando_se_eligen_varios():
    bloques = bloques_documentados(("f1", "f3", "f2"), HECHOS)

    assert [b.fact_refs for b in bloques] == [("f2",), ("f3",), ("f1",)]


def test_bloques_documentados_desempata_por_el_orden_de_los_hechos_cuando_comparten_dia():
    bloques = bloques_documentados(("f5", "f1"), HECHOS)

    assert [b.fact_refs for b in bloques] == [("f1",), ("f5",)]


def test_bloques_documentados_deja_al_final_el_hecho_sin_fecha_confiable():
    bloques = bloques_documentados(("f4", "f1"), HECHOS)

    assert [b.fact_refs for b in bloques] == [("f1",), ("f4",)]
    assert bloques[-1].texto.endswith("sin fecha confiable.")


def test_bloques_documentados_no_repite_el_hecho_cuando_el_llm_lo_cita_dos_veces():
    bloques = bloques_documentados(("f3", "f3"), HECHOS)

    assert [b.fact_refs for b in bloques] == [("f3",)]


def test_bloques_documentados_falla_cuando_el_factref_no_es_de_los_hechos_del_turno():
    with pytest.raises(KeyError):
        bloques_documentados(("f9",), HECHOS)
