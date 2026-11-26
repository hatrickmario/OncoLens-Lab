"""CLI de la variante de contexto del chunk (US-279 AC-3, AC-4, AC-5 y AC-6, L1D-337): guardas de arranque y ``reindex-context``.

``ingest``, ``load_seed_corpus`` y ``reindex-context`` validan la variante, la coincidencia entre variante y colección (RN-22) y, con
``llm``, el LLM local (RN-12) ANTES de abrir una conexión, leer un manifiesto o llamar a un modelo; fallan nombrando solo las variables.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from app.scripts import ingest, load_seed_corpus
from tests.support.ingesta import MANIFIESTO_FX_06C_B, CodificadorSparseFalso
from tests.support.reindex_contexto_cli import TEXTO_SECRETO_DEL_CHUNK, puertos
from tests.support.semilla import EmbedderFalso
from tests.unit.test_script_ingest import ENTORNO_VALIDO

RAIZ_APP = Path(__file__).resolve().parents[2]
PLAZO_S = 60
ARGUMENTOS = ["--manifest", str(MANIFIESTO_FX_06C_B)]
BASE = "corpus_chunks"
DETERMINISTA = "corpus_chunks__ctx_determinista_v1"
LLM = "corpus_chunks__ctx_llm_v1"


@pytest.fixture
def entorno(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    for clave in (
        "MODEL_PROVIDER",
        "ALLOW_CC_BY_NC",
        "CORPUS_CHUNK_CONTEXT",
        "MILVUS_COLLECTION_NAME",
        "LLM_PROVIDER",
        "LLM_CLOUD_ENABLED",
        "LLM_BASE_URL",
    ):
        monkeypatch.delenv(clave, raising=False)
    for clave, valor in ENTORNO_VALIDO.items():
        monkeypatch.setenv(clave, valor)
    return monkeypatch


@pytest.fixture
def entorno_de_reindexacion(entorno: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    """Como ``entorno`` con ``MODEL_PROVIDER=local``: la reindexación lo exige por código (RN-12) y, con adapters falsos, no carga pesos."""
    entorno.setenv("MODEL_PROVIDER", "local")
    return entorno


def _ingerir(capsys: pytest.CaptureFixture[str]) -> tuple[int, str, str]:
    codigo = ingest.main(ARGUMENTOS, embedder=EmbedderFalso(), sparse=CodificadorSparseFalso())
    capturado = capsys.readouterr()
    return codigo, capturado.out, capturado.err


def _reindexar(
    capsys: pytest.CaptureFixture[str], *argumentos: str, con_puertos: bool = True
) -> tuple[int, str, str]:
    codigo = ingest.main(
        ["reindex-context", *argumentos],
        embedder=EmbedderFalso(),
        sparse=CodificadorSparseFalso(),
        puertos_contexto=puertos() if con_puertos else None,
    )
    capturado = capsys.readouterr()
    return codigo, capturado.out, capturado.err


# --- ingest: variante y colección -------------------------------------------------------------------------------


@pytest.mark.ac("US-279", 3)
def test_ingest_con_una_variante_fuera_del_conjunto_sale_con_1_nombrando_la_variable_sin_conectar(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """[US-279 AC-3] ``CORPUS_CHUNK_CONTEXT = resumen`` detiene la ingesta sin leer el manifiesto ni escribir."""
    entorno.setenv("CORPUS_CHUNK_CONTEXT", "resumen")

    codigo, salida, error = _ingerir(capsys)

    assert codigo == 1 and salida == ""
    assert "CORPUS_CHUNK_CONTEXT" in error and "resumen" not in error
    assert "falló (" not in error


@pytest.mark.ac("US-279", 5)
@pytest.mark.parametrize(
    ("variante", "coleccion"),
    [("determinista", BASE), ("ninguno", DETERMINISTA), ("llm", DETERMINISTA)],
)
def test_ingest_con_una_coleccion_que_no_corresponde_a_la_variante_sale_con_1_nombrando_las_dos_variables(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], variante: str, coleccion: str
) -> None:
    """[US-279 AC-5] Ninguna ingesta escribe un chunk en una colección de otra variante."""
    entorno.setenv("CORPUS_CHUNK_CONTEXT", variante)
    entorno.setenv("MILVUS_COLLECTION_NAME", coleccion)

    codigo, salida, error = _ingerir(capsys)

    assert codigo == 1 and salida == ""
    assert "CORPUS_CHUNK_CONTEXT" in error and "MILVUS_COLLECTION_NAME" in error
    assert "falló (" not in error


@pytest.mark.ac("US-279", 4)
@pytest.mark.parametrize(
    ("variable", "ajuste"),
    [
        ("LLM_CLOUD_ENABLED", {"LLM_CLOUD_ENABLED": "true"}),
        ("LLM_PROVIDER", {"LLM_PROVIDER": "fake"}),
        (
            "LLM_BASE_URL",
            {"LLM_ALLOWED_HOSTS": "api.example.com", "LLM_BASE_URL": "https://api.example.com/v1"},
        ),
    ],
)
def test_la_variante_llm_con_un_llm_no_local_detiene_la_ingesta_nombrando_solo_la_variable(
    entorno: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    variable: str,
    ajuste: dict[str, str],
) -> None:
    """[US-279 AC-4] RN-12: sin LLM local no hay variante ``llm``, y nada se llama ni se escribe."""
    entorno.setenv("CORPUS_CHUNK_CONTEXT", "llm")
    entorno.setenv("MILVUS_COLLECTION_NAME", LLM)
    for clave, valor in ajuste.items():
        entorno.setenv(clave, valor)

    codigo, salida, error = _ingerir(capsys)

    assert codigo == 1 and salida == "" and variable in error
    assert "falló (" not in error and "api.example.com" not in error


# --- load_seed_corpus ---------------------------------------------------------------------------------------------


def _cargar_semilla(capsys: pytest.CaptureFixture[str]) -> tuple[int, str, str]:
    codigo = load_seed_corpus.main(embedder=EmbedderFalso())
    capturado = capsys.readouterr()
    return codigo, capturado.out, capturado.err


@pytest.mark.ac("US-279", 5)
def test_la_semilla_con_una_coleccion_que_no_corresponde_a_la_variante_sale_con_1_nombrando_las_dos_variables(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """[US-279 AC-5] La semilla y la ingesta no indexan con variantes distintas."""
    entorno.setenv("CORPUS_SEED_MANIFEST_PATH", str(MANIFIESTO_FX_06C_B))
    entorno.setenv("CORPUS_CHUNK_CONTEXT", "determinista")

    codigo, salida, error = _cargar_semilla(capsys)

    assert codigo == 1 and salida == ""
    assert "CORPUS_CHUNK_CONTEXT" in error and "MILVUS_COLLECTION_NAME" in error
    assert "falló (" not in error


@pytest.mark.ac("US-279", 3)
def test_la_semilla_no_admite_la_variante_llm_y_lo_dice_nombrando_la_variable(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """[US-279 AC-3] La semilla no tiene LLM: la variante ``llm`` solo existe en ``ingest`` y ``reindex-context``."""
    entorno.setenv("CORPUS_SEED_MANIFEST_PATH", str(MANIFIESTO_FX_06C_B))
    entorno.setenv("CORPUS_CHUNK_CONTEXT", "llm")
    entorno.setenv("MILVUS_COLLECTION_NAME", LLM)

    codigo, salida, error = _cargar_semilla(capsys)

    assert codigo == 1 and salida == "" and "CORPUS_CHUNK_CONTEXT" in error
    assert "falló (" not in error


# --- reindex-context -----------------------------------------------------------------------------------------------


def test_reindex_context_exige_la_coleccion_de_origen(
    entorno_de_reindexacion: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    with pytest.raises(SystemExit) as salida:
        _reindexar(capsys)

    assert salida.value.code != 0 and "--origen" in capsys.readouterr().err


@pytest.mark.ac("US-279", 5)
@pytest.mark.parametrize(
    ("variante", "coleccion"), [("determinista", BASE), ("ninguno", DETERMINISTA), ("llm", BASE)]
)
def test_reindex_context_con_una_coleccion_que_no_corresponde_a_la_variante_sale_con_1_sin_escribir(
    entorno_de_reindexacion: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    variante: str,
    coleccion: str,
) -> None:
    """[US-279 AC-5] Termina con código distinto de cero nombrando las dos variables y sin escribir ningún chunk."""
    entorno_de_reindexacion.setenv("CORPUS_CHUNK_CONTEXT", variante)
    entorno_de_reindexacion.setenv("MILVUS_COLLECTION_NAME", coleccion)

    codigo, salida, error = _reindexar(capsys, "--origen", "otra_coleccion")

    assert codigo == 1 and salida == ""
    assert "CORPUS_CHUNK_CONTEXT" in error and "MILVUS_COLLECTION_NAME" in error


def test_reindex_context_con_origen_igual_al_destino_sale_con_1_nombrando_origen_antes_de_leer(
    entorno_de_reindexacion: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno_de_reindexacion.setenv("CORPUS_CHUNK_CONTEXT", "determinista")
    entorno_de_reindexacion.setenv("MILVUS_COLLECTION_NAME", DETERMINISTA)

    codigo, salida, error = _reindexar(capsys, "--origen", DETERMINISTA.upper())

    assert codigo == 1 and salida == "" and "--origen" in error


@pytest.mark.ac("US-279", 4)
@pytest.mark.parametrize(
    ("variable", "ajuste"),
    [("LLM_CLOUD_ENABLED", "true"), ("LLM_PROVIDER", "fake")],
)
def test_reindex_context_llm_con_un_llm_no_local_sale_con_1_nombrando_la_variable_sin_escribir(
    entorno_de_reindexacion: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    variable: str,
    ajuste: str,
) -> None:
    """[US-279 AC-4] RN-12: la reindexación ``llm`` tampoco usa un LLM que no sea local."""
    entorno_de_reindexacion.setenv("CORPUS_CHUNK_CONTEXT", "llm")
    entorno_de_reindexacion.setenv("MILVUS_COLLECTION_NAME", LLM)
    entorno_de_reindexacion.setenv(variable, ajuste)

    codigo, salida, error = _reindexar(capsys, "--origen", BASE)

    assert codigo == 1 and salida == "" and variable in error and ajuste not in error


def test_reindex_context_determinista_no_exige_un_llm_local(
    entorno_de_reindexacion: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno_de_reindexacion.setenv("CORPUS_CHUNK_CONTEXT", "determinista")
    entorno_de_reindexacion.setenv("MILVUS_COLLECTION_NAME", DETERMINISTA)
    entorno_de_reindexacion.setenv("LLM_CLOUD_ENABLED", "true")

    codigo, salida, _ = _reindexar(capsys, "--origen", BASE)

    assert codigo == 0 and json.loads(salida)["variante"] == "determinista"


def test_reindex_context_sin_model_provider_local_sale_con_1_nombrando_la_variable(
    entorno_de_reindexacion: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno_de_reindexacion.delenv("MODEL_PROVIDER")
    entorno_de_reindexacion.setenv("CORPUS_CHUNK_CONTEXT", "determinista")
    entorno_de_reindexacion.setenv("MILVUS_COLLECTION_NAME", DETERMINISTA)

    codigo, salida, error = _reindexar(capsys, "--origen", BASE)

    assert codigo == 1 and salida == "" and "MODEL_PROVIDER" in error


@pytest.mark.ac("US-279", 6)
def test_reindex_context_escribe_el_destino_e_imprime_un_resumen_sin_texto_de_chunks(
    entorno_de_reindexacion: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """[US-279 AC-6] Sale con 0 y el resumen JSON trae variante, versión, recuentos y duración, y ningún texto."""
    entorno_de_reindexacion.setenv("CORPUS_CHUNK_CONTEXT", "determinista")
    entorno_de_reindexacion.setenv("MILVUS_COLLECTION_NAME", DETERMINISTA)

    codigo, salida, error = _reindexar(capsys, "--origen", BASE)

    resumen = json.loads(salida)
    assert codigo == 0 and error == ""
    assert resumen["modo"] == "reindex-context" and resumen["variante"] == "determinista"
    assert (resumen["leidos"], resumen["reindexados"], resumen["copiados"]) == (3, 2, 1)
    assert TEXTO_SECRETO_DEL_CHUNK not in salida and "Guía de prueba" not in salida


def test_reindex_context_informa_la_etapa_y_la_clase_de_un_fallo_sin_su_mensaje(
    entorno_de_reindexacion: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno_de_reindexacion.setenv("CORPUS_CHUNK_CONTEXT", "determinista")
    entorno_de_reindexacion.setenv("MILVUS_COLLECTION_NAME", DETERMINISTA)
    conexion = puertos()
    conexion.destino.fallar_en["escribir_filas"] = ConnectionError("milvus-secreto.invalid")  # type: ignore[attr-defined]

    codigo = ingest.main(
        ["reindex-context", "--origen", BASE],
        embedder=EmbedderFalso(),
        sparse=CodificadorSparseFalso(),
        puertos_contexto=conexion,
    )

    capturado = capsys.readouterr()
    assert codigo == 1 and capturado.out == ""
    assert "escribir" in capturado.err and "ConnectionError" in capturado.err
    assert "milvus-secreto" not in capturado.err


@pytest.mark.ac("US-279", 6)
def test_el_proceso_real_de_reindex_context_termina_con_0_dentro_del_plazo_y_su_resumen_no_trae_texto_de_chunks(
    entorno_de_reindexacion: pytest.MonkeyPatch,
) -> None:
    """Humo del subcomando en un proceso aparte con adapters falsos, con plazo explícito de 60 s."""
    variables = {
        **ENTORNO_VALIDO,
        "MODEL_PROVIDER": "local",
        "CORPUS_CHUNK_CONTEXT": "determinista",
        "MILVUS_COLLECTION_NAME": DETERMINISTA,
        "PATH": os.environ.get("PATH", ""),
        "PYTHONPATH": str(RAIZ_APP),
    }

    proceso = subprocess.run(
        [
            sys.executable,
            "-m",
            "tests.support.reindex_contexto_cli",
            "reindex-context",
            "--origen",
            BASE,
        ],
        cwd=RAIZ_APP,
        env=variables,
        capture_output=True,
        text=True,
        timeout=PLAZO_S,
        check=False,
    )

    assert proceso.returncode == 0, proceso.stderr
    resumen = json.loads(proceso.stdout)
    assert resumen["modo"] == "reindex-context" and resumen["reindexados"] == 2
    assert TEXTO_SECRETO_DEL_CHUNK not in proceso.stdout and "http" not in proceso.stdout


class _AlmacenSparseEspia:
    """Si la guarda falla ANTES de abrir Milvus, nadie lo toca."""

    def __init__(self) -> None:
        self.llamadas = 0

    def listar_vigentes_paginado(self, lote: int):  # type: ignore[no-untyped-def]
        self.llamadas += 1
        return iter([])

    def reescribir_sparse(self, chunks, vectores_sparse) -> int:  # type: ignore[no-untyped-def]
        self.llamadas += 1
        return 0


@pytest.mark.ac("US-279", 5)
def test_reindex_sparse_rechaza_coleccion_con_marca_de_contexto(
    entorno_de_reindexacion: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """[US-279 AC-5] reindex-sparse no recalcula el sparse sobre una coleccion con prefijo: nombra solo la variable y no escribe."""
    entorno_de_reindexacion.setenv("MILVUS_COLLECTION_NAME", DETERMINISTA)
    almacen = _AlmacenSparseEspia()

    codigo = ingest.main(
        ["reindex-sparse"],
        sparse=CodificadorSparseFalso(),
        almacen_sparse=almacen,  # type: ignore[arg-type]
    )

    capturado = capsys.readouterr()
    assert codigo == 1 and capturado.out == ""
    assert "MILVUS_COLLECTION_NAME" in capturado.err and DETERMINISTA not in capturado.err
    assert almacen.llamadas == 0
