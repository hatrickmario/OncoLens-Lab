"""Cargador de los modelos locales (US-231a AC-7, AC-3, AC-6): verifica, construye y expone la procedencia."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.application.ports import ChunkEncontrado, FalloDeInferencia, ParNli
from app.config.settings import Settings
from app.domain.modelos import describir_modelo
from app.domain.nli import IndicesDeClase
from app.infrastructure.models.local import (
    _comprobar_las_tres_clases_del_nli,
    cargar_embedder_de_pasajes,
    cargar_modelos_locales,
)
from app.infrastructure.models.onnx import DatosExternosNoResueltos
from app.infrastructure.models.verificacion import ModeloNoVerificadoError
from app.infrastructure.nli.mdeberta import ClasificadorNliMdeberta
from tests.support.inferencia_falsa import (
    SesionDeEmbeddingsFalsa,
    SesionNliFalsa,
    TokenizadorFalso,
)
from tests.support.modelos import (
    EntornoDeModelos,
    construir_modelos_con_dobles,
    crear_entorno_de_modelos,
    fabricar_sesion_falsa,
    settings_de_modelos,
    sha256_de,
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
    llamadas: list[tuple[bytes, dict[str, object]]] = []
    falsa = fabricar_sesion_falsa(1024)

    def sesion(contenido: bytes, **opciones: object):
        llamadas.append((contenido, opciones))
        return falsa(contenido)

    cargar_modelos_locales(
        settings_de_modelos(modelos, model_intra_op_threads=3),
        fabricar_sesion=sesion,
        fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
    )

    assert sorted(llamadas) == sorted(
        (modelos.ruta_de(f"{modelo}_MODEL_PATH").read_bytes(), {"hilos": 3, "id_relleno": 1})
        for modelo in ("EMBEDDING", "RERANKER", "NLI")
    )


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


# --- NLI (US-231b) -----------------------------------------------------------------------------------------------------


def test_el_nli_declara_modelo_revision_y_hash_de_la_configuracion(
    modelos: EntornoDeModelos,
) -> None:
    cargados = construir_modelos_con_dobles(modelos)

    assert cargados.clasificador_nli.version == describir_modelo(
        "nli-test", "rev-nli-test", modelos.variables["NLI_MODEL_SHA256"]
    )


def test_el_nli_usa_los_indices_de_clase_de_la_configuracion_y_no_la_posicion(
    modelos: EntornoDeModelos,
) -> None:
    ajustes = settings_de_modelos(
        modelos,
        nli_label_index_entailment=1,
        nli_label_index_neutral=2,
        nli_label_index_contradiction=0,
    )
    cargados = cargar_modelos_locales(
        ajustes,
        fabricar_sesion=fabricar_sesion_falsa(1024, logits_nli=(0.0, 9.0, 0.0)),
        fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
    )

    resultado = cargados.clasificador_nli.clasificar([ParNli("premisa", "hipotesis")])

    assert resultado[0].label == "entailment"


def test_nada_se_construye_cuando_el_tokenizer_del_nli_no_pasa_la_verificacion(
    modelos: EntornoDeModelos,
) -> None:
    modelos.ruta_de("NLI_TOKENIZER_PATH").write_bytes(b"alterado")
    fabricadas: list[object] = []

    with pytest.raises(ModeloNoVerificadoError) as error:
        cargar_modelos_locales(
            settings_de_modelos(modelos),
            fabricar_sesion=lambda contenido, **_: fabricadas.append(contenido),  # type: ignore[arg-type, return-value]
            fabricar_tokenizador=lambda ruta: fabricadas.append(ruta),  # type: ignore[arg-type, return-value]
        )

    assert error.value.variable == "NLI_TOKENIZER_SHA256"
    assert fabricadas == []


@pytest.mark.parametrize(
    ("cambios", "variable"),
    [
        ({"nli_label_index_entailment": 4711}, "NLI_LABEL_INDEX_ENTAILMENT"),
        ({"nli_label_index_neutral": 0}, "NLI_LABEL_INDEX_NEUTRAL"),
        ({"nli_label_index_contradiction": None}, "NLI_LABEL_INDEX_CONTRADICTION"),
    ],
)
def test_un_mapeo_de_clases_invalido_termina_antes_de_verificar_ni_leer_ningun_archivo(
    modelos: EntornoDeModelos, cambios: dict[str, int | None], variable: str
) -> None:
    modelos.ruta_de("EMBEDDING_MODEL_PATH").write_bytes(
        b"alterado"
    )  # si se hasheara primero, nombraría este

    with pytest.raises(ModeloNoVerificadoError) as error:
        cargar_modelos_locales(
            settings_de_modelos(modelos, **cambios),
            fabricar_sesion=fabricar_sesion_falsa(1024),
            fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
        )

    assert error.value.variable == variable
    assert "4711" not in f"{error.value} {error.value!r}"


def test_una_salida_del_nli_sin_tres_clases_termina_nombrando_la_variable_de_indice(
    modelos: EntornoDeModelos,
) -> None:
    falsa = fabricar_sesion_falsa(1024)

    def sesion(contenido: bytes, **opciones: object):
        if contenido == modelos.ruta_de("NLI_MODEL_PATH").read_bytes():
            return SesionNliFalsa(columnas=2)
        return falsa(contenido, **opciones)

    with pytest.raises(ModeloNoVerificadoError) as error:
        cargar_modelos_locales(
            settings_de_modelos(modelos),
            fabricar_sesion=sesion,
            fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
        )

    assert error.value.variable == "NLI_LABEL_INDEX_ENTAILMENT"


def test_un_nli_que_falla_en_la_comprobacion_de_arranque_nombra_su_variable_de_ruta() -> None:
    clasificador = ClasificadorNliMdeberta(
        SesionNliFalsa(error=RuntimeError("texto-clinico")),
        TokenizadorFalso(),
        version="v",
        indices=IndicesDeClase(0, 1, 2),
        max_length=512,
        max_tokens_por_lote=4096,
    )

    with pytest.raises(ModeloNoVerificadoError) as error:
        _comprobar_las_tres_clases_del_nli(clasificador)

    assert error.value.variable == "NLI_MODEL_PATH" and error.value.__suppress_context__


def test_los_datos_externos_del_nli_se_verifican_y_se_pasan_a_la_sesion_por_su_nombre(
    modelos: EntornoDeModelos, tmp_path: Path
) -> None:
    datos = tmp_path / "modelos" / "nli-model.onnx.data"
    datos.write_bytes(b"datos-externos-verificados")
    recibidos: list[dict[str, object]] = []
    falsa = fabricar_sesion_falsa(1024)

    def sesion(contenido: bytes, **opciones: object):
        if contenido == modelos.ruta_de("NLI_MODEL_PATH").read_bytes():
            recibidos.append(opciones)
        return falsa(contenido, **opciones)

    cargar_modelos_locales(
        settings_de_modelos(
            modelos,
            nli_model_data_path=str(datos),
            nli_model_data_sha256=sha256_de(b"datos-externos-verificados"),
        ),
        fabricar_sesion=sesion,
        fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
    )

    assert recibidos[0]["datos_externos"] == {"nli-model.onnx.data": b"datos-externos-verificados"}


@pytest.mark.parametrize(
    ("cambios", "variable"),
    [
        ({"nli_model_data_sha256": "ab" * 32}, "NLI_MODEL_DATA_PATH"),
        ({"nli_model_data_path": "/no/existe.data"}, "NLI_MODEL_DATA_SHA256"),
    ],
)
def test_un_par_de_datos_externos_incompleto_o_ajeno_termina_nombrando_su_variable(
    modelos: EntornoDeModelos, cambios: dict[str, str], variable: str
) -> None:
    with pytest.raises(ModeloNoVerificadoError) as error:
        cargar_modelos_locales(
            settings_de_modelos(modelos, **cambios),
            fabricar_sesion=fabricar_sesion_falsa(1024),
            fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
        )

    assert error.value.variable == variable


def test_un_nli_con_datos_externos_sin_resolver_nombra_la_variable_de_datos_y_el_resto_la_de_ruta(
    modelos: EntornoDeModelos,
) -> None:
    def sesion(contenido: bytes, **_: object):
        raise DatosExternosNoResueltos("el ONNX referencia datos externos")

    with pytest.raises(ModeloNoVerificadoError) as nli:
        cargar_modelos_locales(
            settings_de_modelos(modelos),
            fabricar_sesion=lambda c, **o: (
                sesion(c)
                if c == modelos.ruta_de("NLI_MODEL_PATH").read_bytes()
                else fabricar_sesion_falsa(1024)(c)
            ),
            fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
        )
    with pytest.raises(ModeloNoVerificadoError) as embeddings:
        cargar_modelos_locales(
            settings_de_modelos(modelos),
            fabricar_sesion=sesion,
            fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
        )

    assert nli.value.variable == "NLI_MODEL_DATA_PATH"
    assert embeddings.value.variable == "EMBEDDING_MODEL_PATH"


# --- embedder de pasajes para la semilla (US-231b AC-8) -----------------------------------------------------------------


def test_el_embedder_de_la_semilla_verifica_solo_los_archivos_de_embeddings(
    modelos: EntornoDeModelos,
) -> None:
    modelos.ruta_de("RERANKER_MODEL_PATH").write_bytes(
        b"alterado"
    )  # no lo abre el cargador de la semilla
    modelos.ruta_de("NLI_MODEL_PATH").unlink()

    embedder = cargar_embedder_de_pasajes(
        settings_de_modelos(modelos),
        fabricar_sesion=fabricar_sesion_falsa(1024),
        fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
    )

    assert len(embedder.embeber(["her2"])[0]) == 1024


@pytest.mark.parametrize(
    ("archivo", "variable"),
    [
        ("EMBEDDING_MODEL_PATH", "EMBEDDING_MODEL_SHA256"),
        ("EMBEDDING_TOKENIZER_PATH", "EMBEDDING_TOKENIZER_SHA256"),
    ],
)
def test_el_embedder_de_la_semilla_nombra_la_variable_cuando_un_archivo_de_embeddings_esta_alterado(
    modelos: EntornoDeModelos, archivo: str, variable: str
) -> None:
    modelos.ruta_de(archivo).write_bytes(b"alterado")

    with pytest.raises(ModeloNoVerificadoError) as error:
        cargar_embedder_de_pasajes(
            settings_de_modelos(modelos),
            fabricar_sesion=fabricar_sesion_falsa(1024),
            fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
        )

    assert error.value.variable == variable


def test_sin_la_configuracion_de_adr39_termina_nombrando_la_primera_clave_de_modelo(
    modelos: EntornoDeModelos,
) -> None:
    ajustes = Settings(_env_file=None, model_provider="local")  # type: ignore[call-arg]

    with pytest.raises(ModeloNoVerificadoError) as error:
        cargar_modelos_locales(ajustes)

    assert error.value.variable == "EMBEDDING_MODEL"
