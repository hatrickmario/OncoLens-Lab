"""Modos de ``python -m app.scripts.ingest`` (US-117b D5, RN-12): ``ingest`` conserva ``--manifest`` y su guarda de LLM;
``reindex-sparse`` exige embeddings locales verificados, no usa LLM y falla cerrado nombrando solo la variable."""

from __future__ import annotations

import io
import os
import subprocess
import sys
from collections.abc import Iterator, Mapping, Sequence
from pathlib import Path

import numpy as np
import pytest

from app.application.corpus_ingestion.ports import ChunkParaReindexar
from app.scripts import ingest
from tests.support.ingesta import MANIFIESTO_FX_06C_B, CodificadorSparseFalso
from tests.support.modelos import (
    EntornoDeModelos,
    crear_entorno_de_modelos,
    entorno_de_arranque,
    sha256_de,
)
from tests.support.semilla import EmbedderFalso
from tests.unit.test_script_ingest import ENTORNO_VALIDO

RAIZ_APP = Path(__file__).resolve().parents[2]
PLAZO_S = 60


class AlmacenEspia:
    """Si la guarda falla ANTES de abrir Milvus, nadie lo toca."""

    def __init__(self) -> None:
        self.llamadas = 0

    def listar_vigentes_paginado(self, lote: int) -> Iterator[list[ChunkParaReindexar]]:
        self.llamadas += 1
        return iter([])

    def reescribir_sparse(
        self, chunks: Sequence[ChunkParaReindexar], vectores_sparse: Sequence[Mapping[int, float]]
    ) -> int:
        self.llamadas += 1
        return 0


@pytest.fixture
def entorno(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    for clave in ("MODEL_PROVIDER", "ALLOW_CC_BY_NC"):
        monkeypatch.delenv(clave, raising=False)
    monkeypatch.setenv("MODEL_PROVIDER", "local")
    monkeypatch.setenv("SPARSE_VECTOR_SOURCE", "modelo_embeddings")
    monkeypatch.setenv("EMBEDDING_SPARSE_WEIGHTS_PATH", "/models/no-existe/sparse_linear.npz")
    monkeypatch.setenv("EMBEDDING_SPARSE_WEIGHTS_SHA256", "ab" * 32)
    return monkeypatch


def _reindexar(
    capsys: pytest.CaptureFixture[str], almacen: AlmacenEspia, *, con_sparse: bool = True
) -> tuple[int, str, str]:
    codigo = ingest.main(
        ["reindex-sparse"],
        sparse=CodificadorSparseFalso() if con_sparse else None,
        almacen_sparse=almacen,
    )
    capturado = capsys.readouterr()
    return codigo, capturado.out, capturado.err


# --- el analizador de argumentos -------------------------------------------------------------------------------


def test_sin_modo_y_sin_manifest_sale_con_codigo_distinto_de_0(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    with pytest.raises(SystemExit) as salida:
        ingest.main([])

    assert salida.value.code != 0 and "--manifest" in capsys.readouterr().err


@pytest.mark.parametrize(
    "argumentos",
    [
        ["reindex-sparse", "--manifest", str(MANIFIESTO_FX_06C_B)],
        ["--manifest", str(MANIFIESTO_FX_06C_B), "reindex-sparse"],
    ],
)
def test_reindex_sparse_rechaza_el_manifest_en_cualquier_posicion(
    entorno: pytest.MonkeyPatch, argumentos: list[str]
) -> None:
    almacen = AlmacenEspia()

    with pytest.raises(SystemExit) as salida:
        ingest.main(argumentos, sparse=CodificadorSparseFalso(), almacen_sparse=almacen)

    assert salida.value.code != 0 and almacen.llamadas == 0


# --- ingest conserva su guarda de LLM; reindex-sparse no la lleva --------------------------------------------


NUBE = {"LLM_CLOUD_ENABLED": "true", "LLM_PROVIDER": "fake"}


def test_ingest_conserva_su_guarda_de_llm_nombrando_solo_la_variable(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    for clave, valor in {**ENTORNO_VALIDO, **NUBE}.items():
        entorno.setenv(clave, valor)

    codigo = ingest.main(
        ["--manifest", str(MANIFIESTO_FX_06C_B)],
        embedder=EmbedderFalso(),
        sparse=CodificadorSparseFalso(),
    )

    capturado = capsys.readouterr()
    assert codigo == 1 and "LLM_CLOUD_ENABLED" in capturado.err and "true" not in capturado.err


def test_reindex_sparse_no_exige_un_llm_local_y_termina_con_0_aunque_la_configuracion_admita_la_nube(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    for clave, valor in NUBE.items():
        entorno.setenv(clave, valor)

    codigo, salida, _ = _reindexar(capsys, AlmacenEspia())

    assert codigo == 0 and '"leidos": 0' in salida


# --- reindex-sparse exige embeddings locales por código --------------------------------------------------------


@pytest.mark.parametrize("valor", [None, "nube-secreta"])
def test_un_proveedor_de_modelos_no_local_detiene_la_reindexacion_nombrando_la_variable_sin_su_valor(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], valor: str | None
) -> None:
    entorno.delenv("MODEL_PROVIDER")
    if valor:
        entorno.setenv("MODEL_PROVIDER", valor)
    almacen = AlmacenEspia()

    codigo, salida, error = _reindexar(capsys, almacen)

    assert codigo == 1 and salida == "" and almacen.llamadas == 0
    assert "MODEL_PROVIDER" in error and (valor is None or valor not in error)


@pytest.mark.parametrize(
    "clave",
    ["SPARSE_VECTOR_SOURCE", "EMBEDDING_SPARSE_WEIGHTS_PATH", "EMBEDDING_SPARSE_WEIGHTS_SHA256"],
)
def test_una_variable_de_pesos_sparse_ausente_detiene_la_reindexacion_nombrandola(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], clave: str
) -> None:
    entorno.delenv(clave)
    almacen = AlmacenEspia()

    codigo, salida, error = _reindexar(capsys, almacen)

    assert codigo == 1 and salida == "" and clave in error and almacen.llamadas == 0


# --- los archivos de modelos se verifican por SHA-256 (proceso real, plazo explícito) ----------------------------


def _npz() -> bytes:
    buffer = io.BytesIO()
    np.savez(buffer, weight=np.zeros((1, 1024), dtype=np.float32), bias=np.array([0.0], np.float32))
    return buffer.getvalue()


def _entorno_del_proceso(tmp_path: Path, **cambios: str | None) -> dict[str, str]:
    modelos: EntornoDeModelos = crear_entorno_de_modelos(tmp_path / "modelos")
    pesos = tmp_path / "sparse_linear.npz"
    pesos.write_bytes(_npz())
    base = {
        "SPARSE_VECTOR_SOURCE": "modelo_embeddings",
        "EMBEDDING_SPARSE_WEIGHTS_PATH": str(pesos),
        "EMBEDDING_SPARSE_WEIGHTS_SHA256": sha256_de(_npz()),
        "MILVUS_URI": "http://milvus-secreto.invalid:19530",
        "MILVUS_DENSE_METRIC_TYPE": "COSINE",
    }
    return entorno_de_arranque(modelos, **{**base, **cambios})


def _proceso(entorno: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "app.scripts.ingest", "reindex-sparse"],
        cwd=RAIZ_APP,
        env=entorno,
        capture_output=True,
        text=True,
        timeout=PLAZO_S,
        check=False,
    )


@pytest.mark.parametrize(
    ("cambios", "variable"),
    [
        ({"EMBEDDING_SPARSE_WEIGHTS_SHA256": "cd" * 32}, "EMBEDDING_SPARSE_WEIGHTS_SHA256"),
        ({"EMBEDDING_MODEL_SHA256": "cd" * 32}, "EMBEDDING_MODEL_SHA256"),
        ({"EMBEDDING_TOKENIZER_SHA256": "cd" * 32}, "EMBEDDING_TOKENIZER_SHA256"),
        ({"MODEL_PROVIDER": None}, "MODEL_PROVIDER"),
    ],
)
def test_el_proceso_real_falla_cerrado_nombrando_la_variable_sin_su_valor_y_sin_abrir_milvus(
    tmp_path: Path, cambios: dict[str, str | None], variable: str
) -> None:
    proceso = _proceso(_entorno_del_proceso(tmp_path, **cambios))

    assert proceso.returncode != 0 and proceso.stdout == ""
    assert variable in proceso.stderr
    assert "cd" * 32 not in proceso.stderr
    assert "milvus-secreto" not in proceso.stderr and "leer_vigentes" not in proceso.stderr
