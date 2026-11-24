"""``ingest brazo-de-chunks`` (US-278, ``[S7 resp. 14]``, RN-05, RN-12): otra colección, el catálogo solo en lectura, sin LLM."""

from __future__ import annotations

import json
from copy import deepcopy

import pytest

from app.application.seed_corpus.ports import RegistroDeDocumento
from app.infrastructure.fetch.fuente_de_texto import FuenteDeTextoDelManifiesto
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras
from app.scripts import ingest
from app.scripts.ingest import PuertosDelBrazoDeChunks
from tests.integration.corpus_ingestion.conftest import Montaje, montar
from tests.support.almacenes_falsos import AlmacenDeChunksEnMemoria
from tests.support.ingesta import MANIFIESTO_FX_06C_B, CodificadorSparseFalso
from tests.support.semilla import DIRECTORIO_DE_FIXTURES, EmbedderFalso
from tests.unit.test_script_ingest import ENTORNO_VALIDO

COLECCION = "corpus_chunks_512"


class CatalogoSoloLectura:
    def __init__(self, montaje: Montaje) -> None:
        self._montaje = montaje

    def documentos_vigentes_con_poblacion(self) -> list[RegistroDeDocumento]:
        return self._montaje.catalogo.documentos_vigentes_con_poblacion()


@pytest.fixture
def entorno(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    monkeypatch.delenv("ALLOW_CC_BY_NC", raising=False)
    monkeypatch.delenv("MILVUS_COLLECTION_NAME", raising=False)
    for clave, valor in {**ENTORNO_VALIDO, "MODEL_PROVIDER": "local"}.items():
        monkeypatch.setenv(clave, valor)
    return monkeypatch


def _argumentos(*extra: str, coleccion: str = COLECCION) -> list[str]:
    return [
        "brazo-de-chunks",
        "--manifest",
        str(MANIFIESTO_FX_06C_B),
        "--coleccion",
        coleccion,
        "--tamano",
        "5",
        "--solape",
        "0",
        *extra,
    ]


def _main(argv: list[str], montaje: Montaje, alterno: AlmacenDeChunksEnMemoria) -> int:
    return ingest.main(
        argv,
        embedder=EmbedderFalso(),
        sparse=CodificadorSparseFalso(),
        tokenizador=TokenizadorPorPalabras(),
        puertos_brazo=PuertosDelBrazoDeChunks(
            catalogo=CatalogoSoloLectura(montaje),
            almacen=alterno,
            fuente=FuenteDeTextoDelManifiesto(DIRECTORIO_DE_FIXTURES, None),
        ),
    )


@pytest.mark.ac("US-278", 4)
def test_la_cli_ingiere_el_brazo_en_su_coleccion_y_deja_el_catalogo_y_el_origen_intactos_cuando_los_argumentos_son_validos(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    montaje = montar()
    montaje.ingerir()
    catalogo, origen = deepcopy(montaje.catalogo.documentos), deepcopy(montaje.almacen.chunks)
    alterno = AlmacenDeChunksEnMemoria()

    codigo = _main(_argumentos(), montaje, alterno)

    salida = json.loads(capsys.readouterr().out)
    assert (
        codigo == 0
        and salida["coleccion"] == COLECCION
        and salida["chunks"] == len(alterno.chunks) > 0
    )
    assert montaje.catalogo.documentos == catalogo and montaje.almacen.chunks == origen
    assert {d["document_key"] for d in salida["documentos"] if d["chunks"]} == {
        "i-ct-1",
        "i-lit-1",
        "i-lit-2",
        "i-gl-1",
    }


def test_la_cli_se_niega_con_1_cuando_la_coleccion_es_la_de_milvus_collection_name_y_no_abre_nada(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    montaje = montar()
    alterno = AlmacenDeChunksEnMemoria()

    codigo = _main(_argumentos(coleccion="corpus_chunks"), montaje, alterno)

    capturado = capsys.readouterr()
    assert codigo == 1 and "MILVUS_COLLECTION_NAME" in capturado.err and capturado.out == ""
    assert alterno.chunks == {}


def test_la_cli_exige_la_coleccion_y_el_tamano_en_los_argumentos(
    entorno: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(SystemExit) as sin_coleccion:
        ingest.main(["brazo-de-chunks", "--manifest", str(MANIFIESTO_FX_06C_B), "--tamano", "5"])
    with pytest.raises(SystemExit) as sin_tamano:
        ingest.main(
            ["brazo-de-chunks", "--manifest", str(MANIFIESTO_FX_06C_B), "--coleccion", COLECCION]
        )

    assert sin_coleccion.value.code == 2 and sin_tamano.value.code == 2


def test_la_cli_nombra_model_provider_y_no_abre_milvus_cuando_los_modelos_no_son_locales(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno.setenv("MODEL_PROVIDER", "fake")
    alterno = AlmacenDeChunksEnMemoria()

    codigo = _main(_argumentos(), montar(), alterno)

    capturado = capsys.readouterr()
    assert codigo == 1 and "MODEL_PROVIDER" in capturado.err and alterno.chunks == {}


def test_la_cli_rechaza_un_solape_que_no_deja_avanzar_el_chunk_sin_escribir_nada(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    montaje = montar()
    montaje.ingerir()
    alterno = AlmacenDeChunksEnMemoria()
    argumentos = _argumentos()
    argumentos[argumentos.index("--solape") + 1] = "5"

    codigo = _main(argumentos, montaje, alterno)

    assert codigo == 1 and alterno.chunks == {} and capsys.readouterr().out == ""


def test_la_cli_sale_con_1_y_nombra_la_etapa_cuando_un_documento_falla(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    montaje = montar()
    montaje.ingerir()
    alterno = AlmacenDeChunksEnMemoria()
    alterno.fallar_en["upsert_chunks"] = RuntimeError("uri-secreta")

    codigo = _main(_argumentos(), montaje, alterno)

    salida = capsys.readouterr().out
    assert codigo == 1 and "milvus: RuntimeError" in salida and "uri-secreta" not in salida
