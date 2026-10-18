"""Archivos de modelo MÍNIMOS pero válidos para ejercitar el runtime real sin pesos (RN-14): ONNX y ``tokenizer.json``.

El ONNX se escribe a mano en el formato de protobuf (solo hace falta lo que ONNX Runtime lee para crear una sesión), de
modo que la CI prueba la carga REAL desde bytes y el rechazo de los datos externos no declarados sin depender del
paquete ``onnx`` ni de pesos reales.
"""

from __future__ import annotations

from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace

ELEMENTO_FLOAT = 1
ENTORNO_EXTERNO = 1  # TensorProto.DataLocation.EXTERNAL
VERSION_IR = 8
VERSION_OPSET = 17


def _varint(numero: int) -> bytes:
    salida = bytearray()
    while True:
        byte, numero = numero & 0x7F, numero >> 7
        salida.append(byte | (0x80 if numero else 0))
        if not numero:
            return bytes(salida)


def _campo_numero(campo: int, valor: int) -> bytes:
    return _varint(campo << 3) + _varint(valor)


def _campo_bytes(campo: int, datos: bytes | str) -> bytes:
    contenido = datos.encode() if isinstance(datos, str) else datos
    return _varint((campo << 3) | 2) + _varint(len(contenido)) + contenido


def _valor(nombre: str, dimension: int) -> bytes:
    forma = _campo_bytes(1, _campo_numero(1, dimension))
    tensor = _campo_numero(1, ELEMENTO_FLOAT) + _campo_bytes(2, forma)
    return _campo_bytes(1, nombre) + _campo_bytes(2, _campo_bytes(1, tensor))


def _modelo(grafo: bytes) -> bytes:
    version = _campo_bytes(8, _campo_numero(2, VERSION_OPSET))
    return _campo_numero(1, VERSION_IR) + version + _campo_bytes(7, grafo)


def onnx_identidad() -> bytes:
    """Una sesión válida (``Identity`` de ``input_ids``): sirve para los modelos que no son el protagonista del test."""
    nodo = _campo_bytes(1, "input_ids") + _campo_bytes(2, "y") + _campo_bytes(4, "Identity")
    grafo = (
        _campo_bytes(1, nodo)
        + _campo_bytes(2, "g")
        + _campo_bytes(11, _valor("input_ids", 1))
        + _campo_bytes(12, _valor("y", 1))
    )
    return _modelo(grafo)


def onnx_con_datos_externos(ubicacion: str) -> bytes:
    """``y = x + w`` con ``w`` guardado fuera, en ``ubicacion`` (como deja ``torch.onnx.export`` su ``.onnx.data``)."""
    nodo = (
        _campo_bytes(1, "x") + _campo_bytes(1, "w") + _campo_bytes(2, "y") + _campo_bytes(4, "Add")
    )
    externo = _campo_bytes(13, _campo_bytes(1, "location") + _campo_bytes(2, ubicacion))
    inicializador = (
        _campo_numero(1, 1)
        + _campo_numero(2, ELEMENTO_FLOAT)
        + _campo_bytes(8, "w")
        + externo
        + _campo_numero(14, ENTORNO_EXTERNO)
    )
    grafo = (
        _campo_bytes(1, nodo)
        + _campo_bytes(2, "g")
        + _campo_bytes(5, inicializador)
        + _campo_bytes(11, _valor("x", 1))
        + _campo_bytes(12, _valor("y", 1))
    )
    return _modelo(grafo)


def tokenizer_json(relleno: str = "<pad>", con_padding: bool = False) -> bytes:
    """``tokenizer.json`` válido de vocabulario mínimo; ``con_padding`` declara el relleno como lo guarda Hugging Face."""
    vocabulario = {"[UNK]": 0, relleno: 1, "hola": 2, "mundo": 3}
    tokenizador = Tokenizer(WordLevel(vocabulario, unk_token="[UNK]"))
    tokenizador.pre_tokenizer = Whitespace()
    if con_padding:
        tokenizador.enable_padding(pad_id=1, pad_token=relleno)
    return tokenizador.to_str().encode()
