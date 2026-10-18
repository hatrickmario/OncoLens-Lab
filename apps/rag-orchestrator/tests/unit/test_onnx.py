"""Bordes reales de inferencia (US-231a AC-6, AC-8): opciones de ONNX, relleno de lotes y tokenizer local.

Sin pesos: la sesión de ONNX Runtime es un doble que registra la alimentación, y el tokenizer se construye en memoria
con ``tokenizers`` y se guarda en un archivo temporal.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import onnxruntime as ort
import pytest
from tokenizers import Tokenizer, models, pre_tokenizers, processors

from app.infrastructure.models.onnx import (
    DatosExternosNoResueltos,
    SesionOnnx,
    TokenizadorDeArchivo,
    crear_opciones_de_sesion,
)
from tests.support.onnx_minimo import onnx_con_datos_externos, onnx_identidad, tokenizer_json


class SesionOrtFalsa:
    def __init__(self) -> None:
        self.alimentaciones: list[dict[str, np.ndarray]] = []

    def run(self, salidas: object, alimentacion: dict[str, np.ndarray]) -> list[np.ndarray]:
        assert salidas is None
        self.alimentaciones.append(alimentacion)
        return [np.ones((alimentacion["input_ids"].shape[0], 3), dtype=np.float32), np.zeros(1)]


def test_las_opciones_fijan_los_hilos_de_la_configuracion_y_la_ejecucion_secuencial() -> None:
    opciones = crear_opciones_de_sesion(5)

    assert opciones.intra_op_num_threads == 5
    assert opciones.inter_op_num_threads == 1
    assert opciones.execution_mode == ort.ExecutionMode.ORT_SEQUENTIAL


def test_la_sesion_rellena_hasta_el_largo_mayor_y_marca_la_mascara() -> None:
    ort_falsa = SesionOrtFalsa()

    SesionOnnx(ort_falsa, id_relleno=1).ejecutar([[0, 5, 2], [0, 7, 8, 9, 2]])

    alimentacion = ort_falsa.alimentaciones[0]
    assert alimentacion["input_ids"].tolist() == [[0, 5, 2, 1, 1], [0, 7, 8, 9, 2]]
    assert alimentacion["attention_mask"].tolist() == [[1, 1, 1, 0, 0], [1, 1, 1, 1, 1]]
    assert alimentacion["input_ids"].dtype == np.int64


def test_la_sesion_devuelve_la_primera_salida_del_modelo() -> None:
    salida = SesionOnnx(SesionOrtFalsa(), id_relleno=1).ejecutar([[0, 2], [0, 5, 2]])

    assert salida.shape == (2, 3)


@pytest.fixture
def archivo_de_tokenizer(tmp_path: Path) -> Path:
    vocabulario = {"<s>": 0, "<pad>": 1, "</s>": 2, "<unk>": 3, "her2": 4, "mama": 5, "cancer": 6}
    tokenizador = Tokenizer(models.WordLevel(vocabulario, unk_token="<unk>"))
    tokenizador.pre_tokenizer = pre_tokenizers.Whitespace()
    tokenizador.post_processor = processors.TemplateProcessing(
        single="<s> $A </s>",
        pair="<s> $A </s> </s> $B </s>",
        special_tokens=[("<s>", 0), ("</s>", 2)],
    )
    tokenizador.enable_truncation(max_length=3)  # el adapter debe poder ver textos más largos
    ruta = tmp_path / "tokenizer.json"
    tokenizador.save(str(ruta))
    return ruta


def test_el_tokenizer_local_codifica_un_texto_con_sus_tokens_especiales(
    archivo_de_tokenizer: Path,
) -> None:
    assert TokenizadorDeArchivo(archivo_de_tokenizer).codificar("her2 mama") == [0, 4, 5, 2]


def test_el_tokenizer_local_codifica_la_pareja_pregunta_pasaje(archivo_de_tokenizer: Path) -> None:
    assert TokenizadorDeArchivo(archivo_de_tokenizer).codificar("her2", "cancer") == [
        0,
        4,
        2,
        2,
        6,
        2,
    ]


def test_el_tokenizer_local_no_trunca_un_texto_largo(archivo_de_tokenizer: Path) -> None:
    ids = TokenizadorDeArchivo(archivo_de_tokenizer).codificar("her2 mama cancer her2 mama cancer")

    assert len(ids) == 8


def test_el_tokenizer_local_expone_el_id_del_token_de_relleno(archivo_de_tokenizer: Path) -> None:
    assert TokenizadorDeArchivo(archivo_de_tokenizer).id_relleno == 1


def _guardar(tmp_path: Path, contenido: bytes) -> Path:
    ruta = tmp_path / "tokenizer.json"
    ruta.write_bytes(contenido)
    return ruta


def test_el_relleno_es_el_pad_token_corchete_cuando_el_tokenizer_lo_declara_asi(
    tmp_path: Path,
) -> None:
    """mDeBERTa usa ``[PAD]`` y no ``<pad>`` (US-231b): el relleno sale del propio tokenizer.json verificado."""
    ruta = _guardar(tmp_path, tokenizer_json("[PAD]"))

    assert TokenizadorDeArchivo(ruta).id_relleno == 1


def test_el_relleno_es_el_pad_id_declarado_en_el_padding_del_tokenizer(tmp_path: Path) -> None:
    ruta = _guardar(tmp_path, tokenizer_json("<relleno-propio>", con_padding=True))

    assert TokenizadorDeArchivo(ruta).id_relleno == 1


def test_el_tokenizer_cargado_sigue_sin_relleno_ni_truncado_aunque_el_archivo_los_declare(
    tmp_path: Path,
) -> None:
    ruta = _guardar(tmp_path, tokenizer_json("<pad>", con_padding=True))

    assert TokenizadorDeArchivo(ruta).codificar("hola") == [2]


# --- sesión desde bytes verificados (US-231b D12), con ONNX Runtime real y un ONNX mínimo -------------------------------


def test_la_sesion_se_crea_desde_los_bytes_de_un_onnx_valido() -> None:
    sesion = SesionOnnx.desde_bytes(onnx_identidad(), hilos=1, id_relleno=1)

    assert isinstance(sesion, SesionOnnx)


def test_un_onnx_con_datos_externos_sin_declarar_lanza_datos_externos_no_declarados_aunque_el_data_exista_en_el_cwd(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "datos.bin").write_bytes(b"\x00\x00\x80\x3f")
    monkeypatch.chdir(tmp_path)

    with pytest.raises(DatosExternosNoResueltos) as error:
        SesionOnnx.desde_bytes(onnx_con_datos_externos("datos.bin"), hilos=1, id_relleno=1)

    assert (
        str(tmp_path) not in f"{error.value} {error.value!r}" and error.value.__suppress_context__
    )


def test_un_onnx_con_datos_externos_declarados_se_crea_con_los_bytes_verificados_en_memoria() -> (
    None
):
    sesion = SesionOnnx.desde_bytes(
        onnx_con_datos_externos("datos.bin"),
        hilos=1,
        id_relleno=1,
        datos_externos={"datos.bin": b"\x00\x00\x80\x3f"},
    )

    assert isinstance(sesion, SesionOnnx)


def test_un_onnx_corrupto_lanza_el_error_del_runtime_y_no_datos_externos() -> None:
    with pytest.raises(Exception) as error:
        SesionOnnx.desde_bytes(b"no-es-un-onnx", hilos=1, id_relleno=1)

    assert not isinstance(error.value, DatosExternosNoResueltos)


def test_un_tokenizer_sin_token_de_relleno_falla_al_cargarse(tmp_path: Path) -> None:
    tokenizador = Tokenizer(models.WordLevel({"<unk>": 0, "her2": 1}, unk_token="<unk>"))
    ruta = tmp_path / "sin-relleno.json"
    tokenizador.save(str(ruta))

    with pytest.raises(ValueError):
        TokenizadorDeArchivo(ruta)
