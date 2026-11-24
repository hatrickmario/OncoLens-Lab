"""Ingesta del brazo de chunks de 512 tokens (US-278 AC-4, ``[S7 resp. 14]``, RN-05): otra colección, el catálogo intacto.

Catálogo y almacenes en memoria con el contrato de los reales; los embeddings son falsos y el reloj va congelado. Los chunks del
test miden palabras (el tokenizador por palabras): 5 palabras hacen de «512 tokens» frente a las 12 de la ingesta de origen.
"""

from __future__ import annotations

from collections.abc import Sequence
from copy import deepcopy

import pytest

from app.application.corpus_ingestion.brazo_de_chunks import IngerirBrazoDeChunks
from app.application.seed_corpus.ports import RegistroDeDocumento
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.infrastructure.fetch.fuente_de_texto import FuenteDeTextoDelManifiesto
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.almacenes_falsos import AlmacenDeChunksEnMemoria
from tests.support.fakes import RelojFijo
from tests.support.ingesta import DOCUMENTOS_ADMISIBLES_FX_06C_B, CodificadorSparseFalso
from tests.support.semilla import DIRECTORIO_DE_FIXTURES, EmbedderFalso

TAMANO_DEL_BRAZO = 5  # palabras: menor que las 12 de la ingesta de origen


class CatalogoSoloLectura:
    """Solo lo que el puerto de lectura ofrece: cualquier otra llamada (``guardar_documento``, ``retirar_version``...) es un
    ``AttributeError`` y rompe el test."""

    def __init__(self, interno: Montaje) -> None:
        self._interno = interno

    def documentos_vigentes_con_poblacion(self) -> list[RegistroDeDocumento]:
        return self._interno.catalogo.documentos_vigentes_con_poblacion()


def _servicio(
    montaje: Montaje,
    alterno: AlmacenDeChunksEnMemoria,
    *,
    embedder: EmbedderFalso | None = None,
) -> IngerirBrazoDeChunks:
    return IngerirBrazoDeChunks(
        catalogo=CatalogoSoloLectura(montaje),
        fuente=FuenteDeTextoDelManifiesto(DIRECTORIO_DE_FIXTURES, None),
        almacen=alterno,
        embedder=embedder or EmbedderFalso(),
        codificador_sparse=CodificadorSparseFalso(),
        tokenizador=TokenizadorPorPalabras(),
        tamano_de_chunk=TAMANO_DEL_BRAZO,
        solape_de_chunk=0,
        reloj=RelojFijo(),
    )


def _documentos(montaje: Montaje, *claves: str) -> Sequence[DocumentoDeSemilla]:
    return tuple(
        d
        for d in montaje.documentos()
        if d.document_key in (claves or DOCUMENTOS_ADMISIBLES_FX_06C_B)
    )


@pytest.mark.ac("US-278", 4)
def test_ingerir_el_brazo_deja_intactos_el_catalogo_y_la_coleccion_de_origen_cuando_se_ingesta_el_brazo_de_512(
    montaje: Montaje,
) -> None:
    montaje.ingerir()
    catalogo_antes = deepcopy(montaje.catalogo.documentos)
    releases_antes = list(montaje.catalogo.releases)
    origen_antes = deepcopy(montaje.almacen.chunks)
    alterno = AlmacenDeChunksEnMemoria()

    reporte = _servicio(montaje, alterno).ingerir(_documentos(montaje))

    assert not reporte.hubo_errores and reporte.chunks == len(alterno.chunks) > 0
    assert (
        montaje.catalogo.documentos == catalogo_antes
    )  # ni un documento, ni una versión, ni una release nueva
    assert montaje.catalogo.releases == releases_antes
    assert montaje.almacen.chunks == origen_antes  # la colección de l1d-119, igual que antes
    assert all(len(c.chunk_text.split()) <= TAMANO_DEL_BRAZO for c in alterno.chunks.values())
    assert len(alterno.chunks) > len(
        origen_antes
    )  # chunks más cortos: más chunks, los mismos documentos


def test_los_chunks_del_brazo_son_de_los_mismos_documentos_y_copian_sus_metadatos_del_catalogo(
    montaje: Montaje,
) -> None:
    montaje.ingerir()
    alterno = AlmacenDeChunksEnMemoria()

    _servicio(montaje, alterno).ingerir(_documentos(montaje))

    registros = {r.document_id: r for r in montaje.catalogo.documentos_vigentes_con_poblacion()}
    assert {c.document_id for c in alterno.chunks.values()} == set(registros)
    for chunk in alterno.chunks.values():
        registro = registros[chunk.document_id]
        assert (chunk.source_type, chunk.language, chunk.cancer_type_tags) == (
            registro.source_type,
            registro.language,
            registro.cancer_type_tags,
        )
        assert (
            chunk.is_current
            and chunk.sparse_vector
            and chunk.chunk_id.startswith(registro.document_id)
        )


def test_un_documento_del_manifiesto_sin_registro_vigente_en_el_catalogo_se_omite_y_no_se_inventa_su_metadato(
    montaje: Montaje,
) -> None:
    montaje.ingerir()
    alterno = AlmacenDeChunksEnMemoria()
    sin_ingesta = _documentos(montaje, "i-ct-1")[0]
    ajeno = DocumentoDeSemilla(
        **{**sin_ingesta.__dict__, "document_key": "i-ajeno", "texto": "otro texto distinto"}
    )

    reporte = _servicio(montaje, alterno).ingerir((ajeno,))

    assert [(r.document_key, r.omitido, r.chunks) for r in reporte.resultados] == [
        ("i-ajeno", "sin_registro_vigente", 0)
    ]
    assert alterno.chunks == {}


def test_un_documento_que_falla_deja_su_etapa_y_clase_sin_mensaje_y_el_lote_sigue(
    montaje: Montaje,
) -> None:
    montaje.ingerir()
    alterno = AlmacenDeChunksEnMemoria()
    embedder = EmbedderFalso()
    original = embedder.embeber
    llamadas = {"n": 0}

    def embeber_con_fallo(textos: Sequence[str]):
        llamadas["n"] += 1
        if llamadas["n"] == 1:
            raise RuntimeError("texto-clinico-secreto")
        return original(textos)

    embedder.embeber = embeber_con_fallo  # type: ignore[method-assign]

    reporte = _servicio(montaje, alterno, embedder=embedder).ingerir(_documentos(montaje))

    errores = [r for r in reporte.resultados if r.error is not None]
    assert len(errores) == 1 and errores[0].error == "embeddings: RuntimeError"
    assert "secreto" not in repr(reporte)
    assert len({c.document_id for c in alterno.chunks.values()}) == len(reporte.resultados) - 1


def test_reingerir_el_brazo_reescribe_los_mismos_chunks_sin_duplicar(montaje: Montaje) -> None:
    montaje.ingerir()
    alterno = AlmacenDeChunksEnMemoria()
    servicio = _servicio(montaje, alterno)

    servicio.ingerir(_documentos(montaje))
    primeros = dict(alterno.chunks)
    servicio.ingerir(_documentos(montaje))

    assert alterno.chunks == primeros
