"""Cargador de los modelos locales (US-231a AC-7, AC-3, AC-6): verifica, construye y expone la procedencia."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.application.ports import ChunkEncontrado, FalloDeInferencia
from app.config.settings import Settings
from app.domain.modelos import describir_modelo
from app.infrastructure.models.local import cargar_modelos_locales
from app.infrastructure.models.verificacion import ModeloNoVerificadoError
from tests.support.inferencia_falsa import (
    SesionDeEmbeddingsFalsa,
    SesionDeLogitsFalsa,
    TokenizadorFalso,
)
from tests.support.modelos import (
    EntornoDeModelos,
    construir_modelos_con_dobles,
    crear_entorno_de_modelos,
    settings_de_modelos,
)


@pytest.fixture
def modelos(tmp_path: Path) -> EntornoDeModelos:
    return crear_entorno_de_modelos(tmp_path / "modelos")


def _chunk(texto: str = "x") -> ChunkEncontrado:
    return ChunkEncontrado(chunk_id="c", document_id="d", chunk_text=texto, similitud_dense=0.1)


def test_no_construye_nada_cuando_un_archivo_no_pasa_la_verificacion(
    modelos: EntornoDeModelos,
) -> None:
    modelos.ruta_de("RERANKER_MODEL_PATH").write_bytes(b"alterado")
    fabricadas: list[object] = []

    with pytest.raises(ModeloNoVerificadoError) as error:
        cargar_modelos_locales(
            settings_de_modelos(modelos),
            fabricar_sesion=lambda ruta, **_: fabricadas.append(ruta),  # type: ignore[arg-type, return-value]
            fabricar_tokenizador=lambda ruta: fabricadas.append(ruta),  # type: ignore[arg-type, return-value]
        )

    assert error.value.variable == "RERANKER_MODEL_SHA256"
    assert fabricadas == []


def test_cada_modelo_recibe_su_sesion_con_los_hilos_de_la_configuracion_y_el_relleno_de_su_tokenizer(
    modelos: EntornoDeModelos,
) -> None:
    llamadas: list[tuple[str, dict[str, object]]] = []

    def sesion(ruta: Path, **opciones: object) -> SesionDeLogitsFalsa:
        llamadas.append((ruta.name, opciones))
        return SesionDeLogitsFalsa()

    cargar_modelos_locales(
        settings_de_modelos(modelos, model_intra_op_threads=3),
        fabricar_sesion=sesion,  # type: ignore[arg-type]
        fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
    )

    assert sorted(llamadas) == [
        ("embedding_model.bin", {"hilos": 3, "id_relleno": 1}),
        ("reranker_model.bin", {"hilos": 3, "id_relleno": 1}),
    ]


def test_el_reranker_y_el_embedder_declaran_modelo_revision_y_hash_de_la_configuracion(
    modelos: EntornoDeModelos,
) -> None:
    cargados = construir_modelos_con_dobles(modelos)

    assert cargados.reranker.version == describir_modelo(
        "BAAI/bge-reranker-v2-m3", "rev-reranker-test", modelos.variables["RERANKER_MODEL_SHA256"]
    )
    assert cargados.embedder_consulta.modelo == describir_modelo(
        "BAAI/bge-m3", "rev-embeddings-test", modelos.variables["EMBEDDING_MODEL_SHA256"]
    )


def test_el_reranker_toma_el_maximo_de_pares_de_la_configuracion(
    modelos: EntornoDeModelos,
) -> None:
    cargados = construir_modelos_con_dobles(modelos)

    assert len(cargados.reranker.puntuar("p", [_chunk()] * 12)) == 12
    with pytest.raises(FalloDeInferencia):
        cargados.reranker.puntuar("p", [_chunk()] * 13)


def test_el_embedder_devuelve_la_dimension_de_la_configuracion(modelos: EntornoDeModelos) -> None:
    cargados = construir_modelos_con_dobles(modelos)

    assert len(cargados.embedder_consulta.embeber("her2")) == 1024


@pytest.mark.parametrize("idioma", ["es", "en"])
def test_el_detector_usa_el_idioma_por_defecto_de_la_configuracion_cuando_no_puede_decidir(
    modelos: EntornoDeModelos, idioma: str
) -> None:
    cargados = construir_modelos_con_dobles(modelos, default_query_language=idioma)

    assert cargados.detector_idioma.detectar("HER2 BRCA1") == idioma


def test_una_fabrica_que_falla_termina_nombrando_la_variable_de_ruta_sin_la_ruta(
    modelos: EntornoDeModelos,
) -> None:
    ruta = str(modelos.ruta_de("EMBEDDING_TOKENIZER_PATH"))

    def tokenizador(archivo: Path) -> TokenizadorFalso:
        raise ValueError(f"no se pudo leer {archivo}")

    with pytest.raises(ModeloNoVerificadoError) as error:
        cargar_modelos_locales(
            settings_de_modelos(modelos),
            fabricar_sesion=lambda ruta, **_: SesionDeEmbeddingsFalsa(1024),
            fabricar_tokenizador=tokenizador,
        )

    assert error.value.variable == "EMBEDDING_TOKENIZER_PATH"
    assert ruta not in f"{error.value} {error.value!r}" and error.value.__suppress_context__


def test_sin_la_configuracion_de_adr39_termina_nombrando_la_primera_clave_de_modelo(
    modelos: EntornoDeModelos,
) -> None:
    ajustes = Settings(_env_file=None, model_provider="local")  # type: ignore[call-arg]

    with pytest.raises(ModeloNoVerificadoError) as error:
        cargar_modelos_locales(ajustes)

    assert error.value.variable == "EMBEDDING_MODEL"
