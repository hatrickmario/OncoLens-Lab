"""``ingest reindex-context`` (US-279 AC-4 y AC-6, L1D-337): índice de una variante en una colección propia, sin tocar el origen ni el catálogo.

Integración: ``ReindexarContexto`` real con el origen de una ingesta con ``ninguno`` (memoria o PostgreSQL ``corpus`` y Milvus reales), el
catálogo por su puerto de SOLO LECTURA y un destino en memoria; se fingen solo los bordes (embeddings, *sparse*, LLM de contexto).
"""

from __future__ import annotations

import json
from collections.abc import Callable

import pytest

from app.application.corpus_ingestion.constructores_de_contexto import (
    ConstructorDeterminista,
    constructor_de_contexto,
)
from app.application.corpus_ingestion.ports import ConstructorDeContexto
from app.application.corpus_ingestion.reindexar_contexto import (
    ReindexarContexto,
    ResumenDeReindexacionDeContexto,
)
from app.application.corpus_ingestion.reindexar_sparse import FalloDeReindexacion
from app.application.seed_corpus.ports import RegistroDeDocumento
from app.application.seed_corpus.registros import metadatos_del_contexto_de_documento
from app.domain.corpus_seed.contexto_del_chunk import (
    CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL,
    CONTEXTO_MAX_CHARS_INICIAL,
    VERSION_DE_LA_PLANTILLA,
    VarianteDeContexto,
    contexto_determinista,
    texto_a_embeber,
)
from app.infrastructure.seed_manifest.lector import leer_manifiesto
from tests.integration.corpus_ingestion.conftest import Montaje, montar
from tests.support.almacenes_falsos import AlmacenDeChunksEnMemoria
from tests.support.contexto_llm import GeneradorDeContextoFalso
from tests.support.fakes import RelojFijo
from tests.support.ingesta import (
    MANIFIESTO_FX_06C_B_V2,
    CodificadorSparseFalso,
    EmbedderInterrumpible,
    documentos_fx_06c_b,
)
from tests.support.semilla import DIRECTORIO_DE_FIXTURES

LOTE = 2  # varias páginas con los pocos chunks de test


class CatalogoSoloLectura:
    """El puerto ``LectorDePoblacionDelCorpus`` y nada más: cualquier escritura al catálogo sería un ``AttributeError``."""

    def __init__(self, real: object) -> None:
        self._real = real

    def documentos_vigentes_con_poblacion(self) -> list[RegistroDeDocumento]:
        return self._real.documentos_vigentes_con_poblacion()  # type: ignore[attr-defined, no-any-return]


def _origen_con_historico(fabrica: Callable[..., Montaje]) -> Montaje:
    """Una ingesta con ``ninguno`` y la versión 2 de ``i-gl-1``: sus chunks de la versión 1 quedan no vigentes."""
    montaje = fabrica(DIRECTORIO_DE_FIXTURES)
    montaje.ingerir()
    montaje.servicio.ingerir(leer_manifiesto(MANIFIESTO_FX_06C_B_V2))
    return montaje


def _metadatos_por_documento() -> dict[str, object]:
    documentos = (*documentos_fx_06c_b(), *leer_manifiesto(MANIFIESTO_FX_06C_B_V2))
    return {d.document_key: metadatos_del_contexto_de_documento(d) for d in documentos}


class Entorno:
    def __init__(self, origen: Montaje, constructor: ConstructorDeContexto | None = None) -> None:
        self.origen = origen
        self.destino = AlmacenDeChunksEnMemoria()
        self.embedder = EmbedderInterrumpible()
        self.sparse = CodificadorSparseFalso()
        self.constructor = constructor or ConstructorDeterminista(
            max_chars=CONTEXTO_MAX_CHARS_INICIAL
        )

    def reindexar(
        self, variante: VarianteDeContexto = VarianteDeContexto.DETERMINISTA
    ) -> ResumenDeReindexacionDeContexto:
        return ReindexarContexto(
            origen=self.origen.almacen,
            destino=self.destino,
            catalogo=CatalogoSoloLectura(self.origen.catalogo),
            embedder=self.embedder,
            codificador_sparse=self.sparse,
            constructor=self.constructor,
            variante=variante,
            lote=LOTE,
            reloj=RelojFijo(),
        ).ejecutar()


@pytest.mark.ac("US-279", 6)
def test_reindexar_crea_chunks_vigentes_en_el_destino_con_los_vectores_del_contexto_y_no_toca_el_origen_ni_el_catalogo(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-279 AC-6] Los vigentes del destino llevan los vectores con contexto, los no vigentes se copian y el origen no cambia."""
    origen = _origen_con_historico(fabrica_de_montaje)
    antes = origen.registros_de_chunks()
    vigentes = {i for i, r in antes.items() if r.is_current}
    no_vigentes = set(antes) - vigentes
    assert vigentes and no_vigentes
    entorno = Entorno(origen)

    resumen = entorno.reindexar()

    assert (resumen.leidos, resumen.reindexados, resumen.copiados) == (
        len(antes),
        len(vigentes),
        len(no_vigentes),
    )
    assert set(entorno.destino.chunks) == set(antes)
    referencia, referencia_sparse = EmbedderInterrumpible(), CodificadorSparseFalso()
    metadatos = _metadatos_por_documento()
    for chunk_id in vigentes:
        chunk = entorno.destino.chunks[chunk_id]
        clave = chunk.document_id.split("@")[0]
        contexto = contexto_determinista(
            metadatos[clave],  # type: ignore[arg-type]
            None,
            CONTEXTO_MAX_CHARS_INICIAL,
        )
        esperado = texto_a_embeber(contexto, antes[chunk_id].chunk_text)
        assert chunk.is_current and chunk.chunk_text == antes[chunk_id].chunk_text
        assert list(chunk.dense_vector) == referencia.embeber([esperado])[0]
        assert dict(chunk.sparse_vector or {}) == referencia_sparse.codificar([esperado])[0]
    for chunk_id in no_vigentes:
        copia = entorno.destino.chunks[chunk_id]
        assert not copia.is_current and tuple(copia.dense_vector) == antes[chunk_id].dense
    assert len(entorno.embedder.textos_recibidos) == len(vigentes)
    assert origen.registros_de_chunks() == antes


@pytest.mark.ac("US-279", 6)
def test_reindexar_reanuda_sin_repetir_lo_hecho_y_el_llm_recibe_solo_las_llamadas_que_faltan(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-279 AC-6] Con el destino a medias solo se procesan los chunks que faltan y solo ellos llaman al LLM."""
    generador = GeneradorDeContextoFalso()
    entorno = Entorno(
        _origen_con_historico(fabrica_de_montaje),
        constructor_de_contexto(
            VarianteDeContexto.LLM,
            max_chars=CONTEXTO_MAX_CHARS_INICIAL,
            generador=generador,
            doc_max_chars=CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL,
            concurrencia=1,
        ),
    )
    entorno.reindexar(VarianteDeContexto.LLM)
    completo = {i: c for i, c in entorno.destino.chunks.items()}
    vigentes = sorted(i for i, c in completo.items() if c.is_current)
    faltan = vigentes[:2]
    for chunk_id in faltan:
        del entorno.destino.chunks[chunk_id]
    llamadas_antes = len(generador.llamadas)

    resumen = entorno.reindexar(VarianteDeContexto.LLM)

    assert len(generador.llamadas) - llamadas_antes == 2
    assert resumen.reindexados == 2 and resumen.ya_presentes == len(completo) - 2
    assert set(entorno.destino.chunks) == set(completo)


@pytest.mark.ac("US-279", 4)
def test_la_reindexacion_llm_da_al_generador_la_misma_entrada_que_la_ingesta_para_el_mismo_documento(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-279 AC-4] El inicio del documento sale de los chunks vigentes: en la reindexación es el mismo que vio la ingesta."""
    en_la_ingesta = GeneradorDeContextoFalso()
    montaje_llm = montar(
        constructor_de_contexto=constructor_de_contexto(
            VarianteDeContexto.LLM,
            max_chars=CONTEXTO_MAX_CHARS_INICIAL,
            generador=en_la_ingesta,
            doc_max_chars=CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL,
            concurrencia=1,
        )
    )
    montaje_llm.ingerir()
    en_la_reindexacion = GeneradorDeContextoFalso()
    entorno = Entorno(
        _origen_con_historico(fabrica_de_montaje),
        constructor_de_contexto(
            VarianteDeContexto.LLM,
            max_chars=CONTEXTO_MAX_CHARS_INICIAL,
            generador=en_la_reindexacion,
            doc_max_chars=CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL,
            concurrencia=1,
        ),
    )

    entorno.reindexar(VarianteDeContexto.LLM)

    entradas_ingesta = {e for e, _ in en_la_ingesta.llamadas}
    entradas_reindexacion = {e for e, _ in en_la_reindexacion.llamadas}
    assert entradas_ingesta and entradas_ingesta <= entradas_reindexacion


@pytest.mark.ac("US-279", 6)
def test_un_fallo_de_escritura_informa_la_etapa_y_la_clase_sin_el_mensaje_y_el_origen_no_cambia(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-279 AC-6] Milvus caído al escribir: etapa y clase del error, nunca su mensaje, y el origen intacto (RN-05)."""
    origen = _origen_con_historico(fabrica_de_montaje)
    antes = origen.registros_de_chunks()
    entorno = Entorno(origen)
    entorno.destino.fallar_en["escribir_filas"] = ConnectionError("milvus.invalid:19530 caído")

    with pytest.raises(FalloDeReindexacion) as fallo:
        entorno.reindexar()

    assert (fallo.value.etapa, fallo.value.clase) == ("escribir", "ConnectionError")
    assert "milvus.invalid" not in str(fallo.value)
    assert origen.registros_de_chunks() == antes


@pytest.mark.ac("US-279", 5)
def test_el_resumen_trae_variante_version_recuentos_y_duracion_sin_contenido(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-279 AC-5] El resumen JSON no lleva texto de chunks, prefijos, frases del LLM, URLs ni mensajes de excepción."""
    origen = _origen_con_historico(fabrica_de_montaje)
    entorno = Entorno(origen)

    resumen = entorno.reindexar()

    salida = json.dumps(resumen.como_diccionario(), ensure_ascii=False)
    assert set(json.loads(salida)) == {
        "variante",
        "version_de_la_plantilla",
        "leidos",
        "reindexados",
        "copiados",
        "ya_presentes",
        "con_respaldo_por_salida_invalida",
        "con_respaldo_por_llm_no_disponible",
        "vigentes_sin_registro",
        "duracion_s",
    }
    assert json.loads(salida)["variante"] == "determinista"
    assert json.loads(salida)["version_de_la_plantilla"] == VERSION_DE_LA_PLANTILLA
    for registro in origen.registros_de_chunks().values():
        assert registro.chunk_text not in salida
    assert all(d.title not in salida for d in documentos_fx_06c_b())
    assert "http" not in salida
