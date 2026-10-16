import json
import shutil

import pytest
from pydantic import ValidationError

from app.bootstrap import crear_app
from app.config.settings import Settings
from app.infrastructure.fake.fake_evidence_query import EjemploFixtureInvalido
from tests.support.contract import RAIZ_REPOSITORIO
from tests.support.fakes import settings_de_prueba

EJEMPLOS = RAIZ_REPOSITORIO / "contracts/examples"
URL_CONFIDENCIAL = "http://url-confidencial.test:11434/v1"
BANDERAS_REALES = ["REAL_ANONYMIZED_ENABLED", "REAL_IDENTIFIED_ENABLED"]


@pytest.mark.ac("US-034", 6)
@pytest.mark.parametrize("bandera", BANDERAS_REALES)
def test_arranque_falla_nombrando_llm_provider_y_la_bandera_cuando_llm_provider_es_fake_y_hay_datos_reales(
    bandera, monkeypatch
):
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("LLM_BASE_URL", URL_CONFIDENCIAL)
    monkeypatch.setenv(bandera, "true")

    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None)

    mensaje = str(error.value)
    otra = next(b for b in BANDERAS_REALES if b != bandera)
    assert "LLM_PROVIDER" in mensaje
    assert bandera in mensaje
    assert otra not in mensaje
    assert "url-confidencial" not in mensaje


def test_arranque_acepta_llm_provider_fake_cuando_ninguna_bandera_de_datos_reales_esta_activa(
    monkeypatch,
):
    monkeypatch.setenv("LLM_PROVIDER", "fake")

    assert Settings(_env_file=None).llm_provider == "fake"


def _copiar_ejemplos(destino):
    shutil.copytree(EJEMPLOS, destino)
    return destino


def _mutar_sin_status(archivo):
    contenido = json.loads(archivo.read_text(encoding="utf-8"))
    del contenido["status"]
    contenido["synthesis"]["text"] = "SENTINELA-CONTENIDO"
    archivo.write_text(json.dumps(contenido), encoding="utf-8")


@pytest.mark.ac("US-034", 6)
@pytest.mark.parametrize("alteracion", ["invalido", "ausente"])
def test_arranque_falla_nombrando_el_archivo_cuando_un_ejemplo_no_cumple_el_contrato_o_falta(
    alteracion, tmp_path
):
    ejemplos = _copiar_ejemplos(tmp_path / "ejemplos")
    archivo = ejemplos / "rag-query-con-evidencia.json"
    if alteracion == "invalido":
        _mutar_sin_status(archivo)
    else:
        archivo.unlink()

    with pytest.raises(EjemploFixtureInvalido) as error:
        crear_app(settings_de_prueba(llm_provider="fake", fake_responses_path=ejemplos))

    assert "rag-query-con-evidencia.json" in str(error.value)
    assert "SENTINELA-CONTENIDO" not in str(error.value)
    assert error.value.__cause__ is None
    assert error.value.__suppress_context__
