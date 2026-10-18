"""Reglas puras de citas (RN-01, RN-04): sin adapters ni E/S."""

from app.domain.citations import (
    MotivoDeDescarte,
    OpcionGenerada,
    construir_cita,
    validar_citas,
)
from app.domain.relevance import ChunkPuntuado
from tests.support.recuperacion import FICHAS_FX06A

CITABLES = {"ch-a", "ch-b"}


def _opcion(*chunk_ids: str) -> OpcionGenerada:
    return OpcionGenerada("opción", "razón", tuple(chunk_ids))


def test_validar_citas_descarta_con_sin_citas_la_opcion_sin_ninguna_cita():
    resultado = validar_citas([_opcion()], CITABLES)

    assert resultado.aceptadas == ()
    assert [d.motivo for d in resultado.descartadas] == [MotivoDeDescarte.sin_citas]


def test_validar_citas_descarta_con_cita_invalida_la_opcion_cuya_citas_estan_fuera_del_conjunto():
    resultado = validar_citas([_opcion("ch-x", "ch-y")], CITABLES)

    assert resultado.aceptadas == ()
    assert [d.motivo for d in resultado.descartadas] == [MotivoDeDescarte.cita_invalida]


def test_validar_citas_conserva_solo_las_citas_validas_cuando_la_cita_es_mixta():
    resultado = validar_citas([_opcion("ch-a", "ch-x")], CITABLES)

    assert [a.chunk_ids_validos for a in resultado.aceptadas] == [("ch-a",)]
    assert resultado.descartadas == ()


def test_validar_citas_conserva_una_sola_vez_la_cita_duplicada():
    resultado = validar_citas([_opcion("ch-a", "ch-b", "ch-a")], CITABLES)

    assert resultado.aceptadas[0].chunk_ids_validos == ("ch-a", "ch-b")


def test_validar_citas_clasifica_cada_opcion_por_separado_y_conserva_su_orden():
    buena, ajena, vacia = _opcion("ch-a"), _opcion("ch-x"), _opcion()

    resultado = validar_citas([ajena, buena, vacia], CITABLES)

    assert [a.opcion for a in resultado.aceptadas] == [buena]
    assert [(d.opcion, d.motivo) for d in resultado.descartadas] == [
        (ajena, MotivoDeDescarte.cita_invalida),
        (vacia, MotivoDeDescarte.sin_citas),
    ]


def test_construir_cita_copia_los_metadatos_de_la_ficha_y_el_texto_del_chunk():
    chunk = ChunkPuntuado("ch-m1-1", "doc-m1", "texto original del chunk", 0.87)
    ficha = FICHAS_FX06A["doc-m1"]

    cita = construir_cita(chunk, ficha)

    assert cita.title == ficha.title
    assert cita.sourceName == ficha.source_name
    assert cita.externalId == ficha.external_id
    assert cita.language == ficha.language
    assert cita.sourceType == ficha.source_type
    assert cita.licenseClass == ficha.license_class
    assert cita.publishedAt == ficha.published_at
    assert cita.chunkId == "ch-m1-1"
    assert cita.chunkTextSnapshot == "texto original del chunk"


def test_construir_cita_deja_en_none_los_campos_que_el_catalogo_no_registra():
    chunk = ChunkPuntuado("ch-m1-1", "doc-m1", "texto", 0.87)

    cita = construir_cita(chunk, FICHAS_FX06A["doc-m1"])

    assert cita.authors is None
    assert cita.sourceUrl is None
    assert cita.trialPhase is None


def test_construir_cita_marca_false_vigencia_y_version_posterior_en_el_s1():
    chunk = ChunkPuntuado("ch-m1-1", "doc-m1", "texto", 0.87)

    cita = construir_cita(chunk, FICHAS_FX06A["doc-m1"])

    assert cita.possiblyOutdated is False
    assert cita.newerVersionAvailable is False
