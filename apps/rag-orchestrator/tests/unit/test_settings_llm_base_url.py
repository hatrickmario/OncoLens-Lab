"""RN-12: `LLM_BASE_URL` solo apunta a un host local de la lista permitida (RN-22); el error nombra la clave, nunca el valor."""

from __future__ import annotations

from urllib.parse import urlsplit

import pytest
from pydantic import ValidationError

from app.config.settings import Settings


@pytest.fixture(autouse=True)
def _entorno_limpio(monkeypatch: pytest.MonkeyPatch) -> None:
    for clave in ("LLM_BASE_URL", "LLM_ALLOWED_HOSTS"):
        monkeypatch.delenv(clave, raising=False)


@pytest.mark.parametrize(
    "url",
    [
        "http://host.docker.internal:11434/v1",
        "http://localhost:11434/v1",
        "http://127.0.0.1:8000/v1",
        "http://LOCALHOST:11434/v1",
    ],
)
def test_acepta_un_host_local_de_la_lista_permitida_por_defecto(url: str) -> None:
    assert Settings(_env_file=None, llm_base_url=url).llm_base_url == url  # type: ignore[call-arg]


def test_el_valor_por_defecto_de_llm_base_url_es_un_host_local() -> None:
    url = urlsplit(Settings(_env_file=None).llm_base_url)  # type: ignore[call-arg]

    assert (url.scheme, url.hostname) == ("http", "host.docker.internal")


@pytest.mark.parametrize(
    "url",
    [
        "https://api.nube-externa.example/v1",
        "http://10.0.0.5:11434/v1",
        "http://localhost.nube-externa.example/v1",
    ],
)
def test_rechaza_un_host_que_no_es_local_nombrando_la_clave_y_nunca_el_valor(url: str) -> None:
    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None, llm_base_url=url)  # type: ignore[call-arg]

    mensaje = f"{error.value} {error.value!r}"
    assert "LLM_BASE_URL" in mensaje
    assert "nube-externa" not in mensaje and "10.0.0.5" not in mensaje


@pytest.mark.parametrize("url", ["", "localhost:11434/v1", "ftp://localhost/v1", "http:///v1"])
def test_rechaza_una_url_que_no_es_http_con_host(url: str) -> None:
    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None, llm_base_url=url)  # type: ignore[call-arg]

    assert "LLM_BASE_URL" in str(error.value)


def test_la_lista_de_hosts_permitidos_es_configurable_por_entorno(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_ALLOWED_HOSTS", "llm-nativo.test, otro-local.test")
    monkeypatch.setenv("LLM_BASE_URL", "http://llm-nativo.test:11434/v1")

    ajustes = Settings(_env_file=None)  # type: ignore[call-arg]

    assert ajustes.llm_allowed_hosts == ("llm-nativo.test", "otro-local.test")


def test_una_lista_configurada_reemplaza_a_la_de_defecto_y_rechaza_localhost(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_ALLOWED_HOSTS", "llm-nativo.test")
    monkeypatch.setenv("LLM_BASE_URL", "http://localhost:11434/v1")

    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None)  # type: ignore[call-arg]

    assert "LLM_BASE_URL" in str(error.value)


def test_rechaza_una_url_con_credenciales_aunque_el_host_sea_local_sin_repetirlas() -> None:
    credenciales = "u" + ":" + "clave-secreta"
    url = "http://" + credenciales + "@" + "localhost:11434/v1"

    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None, llm_base_url=url)  # type: ignore[call-arg]

    mensaje = f"{error.value} {error.value!r}"
    assert "LLM_BASE_URL" in mensaje and "clave-secreta" not in mensaje
