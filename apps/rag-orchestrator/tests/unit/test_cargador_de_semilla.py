"""Fallos de dependencias del cargador de la semilla (US-059 D7): un documento con error no detiene la carga.

Fakes de los puertos con el contrato de los reales (``tests/support/almacenes_falsos.py``); el reloj y los ids van
congelados. La integración con PostgreSQL y Milvus reales está en ``tests/integration/corpus_store``.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.application.seed_corpus.reporte import ReporteDeCarga, Resultado, ResultadoDeDocumento
from app.application.seed_corpus.seed_corpus_loader import SeedCorpusLoader
from app.domain.corpus_seed.versionado import calcular_checksum
from app.infrastructure.fetch.fuente_de_texto import FuenteDeTextoDelManifiesto
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras
from tests.support.almacenes_falsos import AlmacenDeChunksEnMemoria, CatalogoEnMemoria
from tests.support.fakes import RelojFijo
from tests.support.semilla import (
    DIRECTORIO_DE_FIXTURES,
    FECHA_DE_CORTE_DE_TEST,
    SOLAPE_DE_CHUNK_DE_TEST,
    TAMANO_DE_CHUNK_DE_TEST,
    EmbedderFalso,
    GeneradorDeIdsFijo,
    documento_de_prueba,
    documentos_fx_06c_a,
    politica_de_test,
)


@dataclass
class Montaje:
    catalogo: CatalogoEnMemoria
    almacen: AlmacenDeChunksEnMemoria
    embedder: EmbedderFalso
    reloj: RelojFijo
    cargador: SeedCorpusLoader

    def cargar(self, *claves: str):
        return self.cargador.cargar(documentos_fx_06c_a(*claves))

    def estados(self) -> dict[str, str]:
        return {i.split("@")[0]: r.status for i, r in self.catalogo.documentos.items()}


@pytest.fixture
def montaje() -> Montaje:
    catalogo, almacen = CatalogoEnMemoria(), AlmacenDeChunksEnMemoria()
    embedder, reloj = EmbedderFalso(), RelojFijo()
    cargador = SeedCorpusLoader(
        catalogo=catalogo,
        almacen_de_chunks=almacen,
        embedder=embedder,
        fuente=FuenteDeTextoDelManifiesto(DIRECTORIO_DE_FIXTURES, None),
        reloj=reloj,
        ids=GeneradorDeIdsFijo(),
        politica=politica_de_test(),
        tokenizador=TokenizadorPorPalabras(),
        tamano_de_chunk=TAMANO_DE_CHUNK_DE_TEST,
        solape_de_chunk=SOLAPE_DE_CHUNK_DE_TEST,
        fecha_de_corte=FECHA_DE_CORTE_DE_TEST,
    )
    return Montaje(catalogo, almacen, embedder, reloj, cargador)


def test_un_embedding_caido_deja_el_documento_en_error_sin_chunks_y_la_carga_sigue(
    montaje: Montaje,
) -> None:
    montaje.embedder.error = ConnectionError("modelo no disponible")

    reporte = montaje.cargar("t-nd", "t-ok-1")

    assert reporte.hubo_errores
    assert reporte.resultado_de("t-ok-1").resultado is Resultado.ERROR
    assert reporte.resultado_de("t-ok-1").motivo == "embeddings: ConnectionError"
    assert (
        reporte.resultado_de("t-nd").resultado is Resultado.RECHAZADO
    )  # el rechazo sigue siendo esperado
    assert montaje.estados() == {"t-nd": "rechazado_licencia", "t-ok-1": "error"}
    assert montaje.almacen.chunks == {} and montaje.catalogo.releases == []


def test_tras_un_error_de_milvus_una_nueva_carga_deja_los_documentos_embebidos(
    montaje: Montaje,
) -> None:
    montaje.almacen.fallar_en["insert_chunks"] = ConnectionError("milvus caído")
    reporte = montaje.cargar("t-ok-1")
    montaje.almacen.fallar_en.clear()

    reporte_2 = montaje.cargar("t-ok-1", "t-ok-2")

    assert reporte.resultado_de("t-ok-1").motivo == "milvus: ConnectionError"
    assert [r.resultado for r in reporte_2.resultados] == [Resultado.CARGADO, Resultado.CARGADO]
    assert montaje.estados() == {"t-ok-1": "embebido", "t-ok-2": "embebido"}


def test_un_error_de_milvus_en_el_primer_documento_no_detiene_el_segundo(montaje: Montaje) -> None:
    montaje.almacen.fallar_en["insert_chunks"] = ConnectionError("milvus caído")

    reporte = montaje.cargar("t-ok-1", "t-ok-2")

    assert [r.resultado for r in reporte.resultados] == [Resultado.ERROR, Resultado.ERROR]
    assert reporte.hubo_errores and montaje.catalogo.ids_de_documentos_vigentes() == frozenset()


def test_el_reporte_de_un_error_nombra_la_etapa_y_la_clase_pero_no_el_mensaje_de_la_excepcion(
    montaje: Montaje,
) -> None:
    montaje.embedder.error = RuntimeError("https://secreto.example/doc?token=abc123")

    reporte = montaje.cargar("t-ok-1")

    assert "secreto" not in str(reporte.como_diccionario()) and "abc123" not in str(
        reporte.como_diccionario()
    )


def test_un_vector_de_otra_dimension_deja_el_documento_en_error_en_lugar_de_insertarlo(
    montaje: Montaje,
) -> None:
    montaje.embedder.dimension = 16

    reporte = montaje.cargar("t-ok-1")

    assert reporte.resultado_de("t-ok-1").motivo == "milvus: DimensionDeVectorInvalida"
    assert montaje.almacen.chunks == {}


def test_un_reintento_tras_un_error_carga_el_documento_con_el_mismo_identificador(
    montaje: Montaje,
) -> None:
    montaje.embedder.error = ConnectionError("modelo no disponible")
    montaje.cargar("t-ok-1")
    (identificador_con_error,) = montaje.catalogo.documentos
    montaje.embedder.error = None

    reporte = montaje.cargar("t-ok-1")

    assert reporte.resultado_de("t-ok-1").resultado is Resultado.CARGADO
    assert list(montaje.catalogo.documentos) == [identificador_con_error]
    assert montaje.catalogo.documentos[identificador_con_error].status == "embebido"


def test_un_reintento_no_duplica_los_chunks_que_ya_quedaron_en_milvus(montaje: Montaje) -> None:
    primero = montaje.cargar("t-ok-1")
    (identificador,) = montaje.catalogo.documentos
    montaje.catalogo.documentos.clear()  # el catálogo "perdió" la fila: Milvus conserva los chunks
    chunks_antes = dict(montaje.almacen.chunks)
    montaje.embedder.invocaciones = 0

    montaje.cargar("t-ok-1")

    assert primero.resultado_de("t-ok-1").chunks == len(chunks_antes) > 0
    assert montaje.almacen.chunks == chunks_antes
    assert montaje.catalogo.documentos[identificador].status == "embebido"


def test_un_texto_que_no_se_puede_leer_deja_el_documento_en_error_con_su_clave_y_sigue(
    montaje: Montaje,
) -> None:
    ilegible = documento_de_prueba(
        document_key="d-ilegible", texto=None, ruta_texto="no-existe.txt"
    )

    reporte = montaje.cargador.cargar([ilegible, *documentos_fx_06c_a("t-ok-1")])

    assert reporte.resultado_de("d-ilegible").motivo == "obtener_texto: FileNotFoundError"
    assert reporte.resultado_de("t-ok-1").resultado is Resultado.CARGADO
    assert "d-ilegible@error" in montaje.catalogo.documentos


def test_un_texto_cuyo_checksum_no_es_el_del_manifiesto_queda_en_error_sin_chunks(
    montaje: Montaje,
) -> None:
    alterado = documento_de_prueba(document_key="d-alterado", checksum_esperado="0" * 64)

    reporte = montaje.cargador.cargar([alterado])

    assert (
        reporte.resultado_de("d-alterado").motivo == "integridad: ChecksumDelManifiestoNoCoincide"
    )
    assert montaje.almacen.chunks == {} and montaje.embedder.invocaciones == 0


def test_un_texto_cuyo_checksum_coincide_con_el_del_manifiesto_se_carga(montaje: Montaje) -> None:
    texto = "Texto sintético con checksum declarado."
    integro = documento_de_prueba(
        document_key="d-integro", texto=texto, checksum_esperado=calcular_checksum(texto)
    )

    reporte = montaje.cargador.cargar([integro])

    assert reporte.resultado_de("d-integro").resultado is Resultado.CARGADO


def test_un_texto_vacio_deja_el_documento_en_error_porque_no_tiene_nada_que_indexar(
    montaje: Montaje,
) -> None:
    vacio = documento_de_prueba(document_key="d-vacio", texto=" \n ")

    reporte = montaje.cargador.cargar([vacio])

    assert reporte.resultado_de("d-vacio").motivo == "texto: TextoVacio"
    assert montaje.almacen.chunks == {}


def test_un_fallo_al_apagar_la_version_anterior_deja_vigente_a_la_anterior_y_el_nuevo_en_error(
    montaje: Montaje,
) -> None:
    montaje.cargar("t-ok-1")
    montaje.almacen.fallar_en["marcar_no_vigentes"] = ConnectionError("milvus caído")

    reporte = montaje.cargar("t-ok-1-v2")

    anterior = next(r for i, r in montaje.catalogo.documentos.items() if i.startswith("t-ok-1@"))
    nuevo = next(r for i, r in montaje.catalogo.documentos.items() if i.startswith("t-ok-1-v2@"))
    assert reporte.resultado_de("t-ok-1-v2").resultado is Resultado.ERROR
    assert (anterior.is_current, anterior.status) == (True, "embebido")
    assert (nuevo.is_current, nuevo.status) == (False, "error")


def test_reintentar_la_nueva_version_tras_ese_fallo_la_deja_vigente_y_apaga_la_anterior(
    montaje: Montaje,
) -> None:
    montaje.cargar("t-ok-1")
    montaje.almacen.fallar_en["marcar_no_vigentes"] = ConnectionError("milvus caído")
    montaje.cargar("t-ok-1-v2")
    montaje.almacen.fallar_en.clear()

    reporte = montaje.cargar("t-ok-1-v2")

    vigentes = [i.split("@")[0] for i in montaje.catalogo.ids_de_documentos_vigentes()]
    assert reporte.resultado_de("t-ok-1-v2").resultado is Resultado.NUEVA_VERSION
    assert vigentes == ["t-ok-1-v2"]
    assert not any(c.is_current for c in montaje.almacen.chunks.values() if "t-ok-1@" in c.chunk_id)


@pytest.mark.parametrize("metodo", ["versiones_del_grupo", "guardar_documento"])
def test_un_catalogo_caido_aborta_la_carga_en_lugar_de_tragarse_el_error(
    montaje: Montaje, metodo: str
) -> None:
    montaje.catalogo.fallar_en[metodo] = ConnectionError("postgres caído")

    with pytest.raises(ConnectionError):
        montaje.cargar("t-ok-1", "t-ok-2")


def test_publicar_la_release_con_el_catalogo_caido_aborta_la_carga(montaje: Montaje) -> None:
    montaje.catalogo.fallar_en["publicar_release"] = ConnectionError("postgres caído")

    with pytest.raises(ConnectionError):
        montaje.cargar("t-ok-1")


def test_el_reporte_cuenta_cada_resultado_y_expone_solo_identificadores() -> None:
    reporte = ReporteDeCarga(
        (
            ResultadoDeDocumento("a", Resultado.CARGADO, chunks=3),
            ResultadoDeDocumento("b", Resultado.RECHAZADO, "sin_licencia"),
            ResultadoDeDocumento("c", Resultado.ERROR, "milvus: ConnectionError"),
        ),
        "release-1",
    )

    datos = reporte.como_diccionario()

    assert datos["resumen"] == {
        "cargado": 1,
        "nueva_version": 0,
        "omitido": 0,
        "rechazado": 1,
        "error": 1,
    }
    assert datos["release_id"] == "release-1" and reporte.hubo_errores


def test_una_carga_sin_documentos_no_publica_release_ni_toca_el_almacen(montaje: Montaje) -> None:
    reporte = montaje.cargador.cargar([])

    assert reporte.resultados == () and reporte.release_id is None
    assert montaje.almacen.chunks == {} and montaje.embedder.invocaciones == 0
