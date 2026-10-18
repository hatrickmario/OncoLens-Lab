"""Verificación de pesos (US-231a AC-7): el SHA-256 se calcula sin disco real y el error nombra solo la variable."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

import pytest

from app.infrastructure.models.verificacion import (
    ModeloNoVerificadoError,
    leer_modelo_verificado,
    verificar_modelo,
)
from tests.support.modelos import sha256_de

RUTA = Path("/modelos-ficticios/reranker-secreto.onnx")
CONTENIDO = b"pesos-sinteticos"
SHA = sha256_de(CONTENIDO)


def _lector(*bloques: bytes):
    def leer(ruta: Path) -> Iterable[bytes]:
        assert ruta == RUTA
        return iter(bloques)

    return leer


def _lector_que_falla(error: OSError):
    def leer(ruta: Path) -> Iterable[bytes]:
        raise error

    return leer


def test_verificar_modelo_no_lanza_cuando_el_hash_coincide() -> None:
    verificar_modelo("X_PATH", "X_SHA256", RUTA, SHA, leer_bloques=_lector(CONTENIDO))


def test_verificar_modelo_calcula_el_hash_de_un_archivo_leido_en_varios_bloques() -> None:
    verificar_modelo(
        "X_PATH", "X_SHA256", RUTA, SHA, leer_bloques=_lector(b"pesos-", b"sinteticos")
    )


def test_verificar_modelo_acepta_el_hash_esperado_en_mayusculas() -> None:
    verificar_modelo("X_PATH", "X_SHA256", RUTA, SHA.upper(), leer_bloques=_lector(CONTENIDO))


def test_verificar_modelo_nombra_la_variable_de_sha_cuando_el_hash_no_coincide() -> None:
    with pytest.raises(ModeloNoVerificadoError) as error:
        verificar_modelo("X_PATH", "X_SHA256", RUTA, SHA, leer_bloques=_lector(b"alterado"))

    assert error.value.variable == "X_SHA256"


def test_verificar_modelo_nombra_la_variable_de_ruta_cuando_el_archivo_no_existe() -> None:
    with pytest.raises(ModeloNoVerificadoError) as error:
        verificar_modelo(
            "X_PATH", "X_SHA256", RUTA, SHA, leer_bloques=_lector_que_falla(FileNotFoundError())
        )

    assert error.value.variable == "X_PATH"


def test_verificar_modelo_nombra_la_variable_de_ruta_cuando_la_ruta_no_esta_configurada() -> None:
    with pytest.raises(ModeloNoVerificadoError) as error:
        verificar_modelo("X_PATH", "X_SHA256", None, SHA, leer_bloques=_lector(CONTENIDO))

    assert error.value.variable == "X_PATH"


@pytest.mark.parametrize("esperado", [None, ""])
def test_verificar_modelo_nombra_la_variable_de_sha_cuando_el_hash_no_esta_configurado(
    esperado: str | None,
) -> None:
    with pytest.raises(ModeloNoVerificadoError) as error:
        verificar_modelo("X_PATH", "X_SHA256", RUTA, esperado, leer_bloques=_lector(CONTENIDO))

    assert error.value.variable == "X_SHA256"


@pytest.mark.parametrize("causa", ["hash", "archivo"])
def test_el_mensaje_del_error_no_contiene_ruta_ni_hashes_ni_encadena_la_causa(causa: str) -> None:
    lector = (
        _lector(b"alterado") if causa == "hash" else _lector_que_falla(PermissionError(str(RUTA)))
    )

    with pytest.raises(ModeloNoVerificadoError) as error:
        verificar_modelo("X_PATH", "X_SHA256", RUTA, SHA, leer_bloques=lector)

    texto = f"{error.value} {error.value!r} {error.value.__cause__}"
    assert str(RUTA) not in texto and SHA not in texto and sha256_de(b"alterado") not in texto
    assert error.value.__suppress_context__ is True


def test_verificar_modelo_lee_un_archivo_real_por_bloques(tmp_path: Path) -> None:
    archivo = tmp_path / "modelo.bin"
    archivo.write_bytes(CONTENIDO * 1000)

    verificar_modelo("X_PATH", "X_SHA256", archivo, sha256_de(CONTENIDO * 1000))


# --- leer_modelo_verificado: los bytes que se hashean son los que se cargan (US-231b D12) -------------------------------


def test_leer_modelo_verificado_devuelve_los_bytes_cuando_el_hash_coincide() -> None:
    assert (
        leer_modelo_verificado("X_PATH", "X_SHA256", RUTA, SHA, leer=lambda _ruta: CONTENIDO)
        == CONTENIDO
    )


def test_leer_modelo_verificado_nombra_la_variable_de_sha_cuando_el_hash_no_coincide() -> None:
    with pytest.raises(ModeloNoVerificadoError) as error:
        leer_modelo_verificado("X_PATH", "X_SHA256", RUTA, SHA, leer=lambda _ruta: b"alterado")

    assert error.value.variable == "X_SHA256"


def test_leer_modelo_verificado_nombra_la_variable_de_ruta_cuando_el_archivo_no_se_puede_leer() -> (
    None
):
    def no_existe(_ruta: Path) -> bytes:
        raise FileNotFoundError(str(RUTA))

    with pytest.raises(ModeloNoVerificadoError) as error:
        leer_modelo_verificado("X_PATH", "X_SHA256", RUTA, SHA, leer=no_existe)

    assert error.value.variable == "X_PATH"
    assert str(RUTA) not in f"{error.value} {error.value!r}" and error.value.__suppress_context__


def test_leer_modelo_verificado_lee_el_archivo_una_sola_vez(tmp_path: Path) -> None:
    lecturas: list[Path] = []

    def leer(ruta: Path) -> bytes:
        lecturas.append(ruta)
        return CONTENIDO

    leer_modelo_verificado("X_PATH", "X_SHA256", RUTA, SHA, leer=leer)

    assert lecturas == [RUTA]


@pytest.mark.parametrize(
    ("ruta", "sha", "variable"), [(None, SHA, "X_PATH"), (RUTA, None, "X_SHA256")]
)
def test_leer_modelo_verificado_nombra_la_variable_que_falta_sin_leer_el_archivo(
    ruta: Path | None, sha: str | None, variable: str
) -> None:
    def no_debe_leer(_ruta: Path) -> bytes:
        raise AssertionError("no debió leer")

    with pytest.raises(ModeloNoVerificadoError) as error:
        leer_modelo_verificado("X_PATH", "X_SHA256", ruta, sha, leer=no_debe_leer)

    assert error.value.variable == variable
