"""Proveedores locales por lista cerrada en código (RN-12, ADR-41 D4): ``es_proveedor_local()`` y el aborto de la suite."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
import respx
import yaml

from app.domain.reglas_proveedor import HOSTS_LOCALES, es_proveedor_local
from app.evaluation.evaluate import main
from app.evaluation.guardas import SuiteAbortada, exigir_adapters_locales
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
FX = RAIZ_REPO / "data" / "eval" / "fx-t5a-a"
NUBE = "https://api.nube-de-prueba.invalid/v1"


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:11434/v1",
        "http://127.0.0.1:8000",
        "http://127.12.0.5/v1",
        "http://[::1]:11434/v1",
        "http://host.docker.internal:11434/v1",
        "HTTP://LOCALHOST:1/",
    ],
)
def test_es_proveedor_local_acepta_loopback_localhost_y_host_docker_internal(url: str) -> None:
    assert es_proveedor_local(url) is True


@pytest.mark.parametrize(
    "url",
    [
        NUBE,
        "http://127.0.0.1.evil.example/v1",
        "http://localhost.evil.example/v1",
        "http://127.0.0.1"
        + chr(64)
        + "evil.example/v1",  # userinfo con forma de correo, armado por partes
        "http://0.0.0.0:8000",
        "http://10.0.0.5:8000",
        "http://192.168.1.10",
        "http://[::1",
        "http://",
        "file:///etc/hosts",
        "no es una url",
        "",
    ],
)
def test_es_proveedor_local_rechaza_hosts_no_listados_y_urls_sin_host_o_ilegibles(
    url: str,
) -> None:
    assert es_proveedor_local(url) is False


def test_la_lista_local_no_se_amplia_por_variable_de_entorno_ni_configuracion(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for nombre in ("HOSTS_LOCALES", "EVAL_HOSTS_LOCALES", "LOCAL_HOSTS", "ALLOWED_HOSTS"):
        monkeypatch.setenv(nombre, "api.nube-de-prueba.invalid")

    assert es_proveedor_local(NUBE) is False
    assert isinstance(HOSTS_LOCALES, frozenset)
    assert "api.nube-de-prueba.invalid" not in HOSTS_LOCALES


def test_la_guarda_deja_pasar_adapters_locales_con_datos_no_sinteticos() -> None:
    exigir_adapters_locales(
        "real_anonimizado", {"embeddings": "http://localhost:11434/v1", "llm": "http://[::1]:1"}
    )


def test_la_guarda_aborta_con_un_solo_adapter_remoto_y_datos_no_sinteticos() -> None:
    with pytest.raises(SuiteAbortada):
        exigir_adapters_locales(
            "real_anonimizado", {"llm": "http://localhost:11434/v1", "embeddings": NUBE}
        )


def test_la_guarda_no_exige_adapters_locales_con_datos_sinteticos() -> None:
    exigir_adapters_locales("sintetico", {"embeddings": NUBE})


@pytest.mark.parametrize("url", ["", "no es una url"])
def test_la_guarda_falla_cerrada_con_urls_vacias_o_ilegibles(url: str) -> None:
    with pytest.raises(SuiteAbortada):
        exigir_adapters_locales("real_anonimizado", {"ocr": url})


def dataset_real_sin_preguntas(destino: Path) -> Path:
    """Dataset ``real_anonimizado`` FUERA del repo al que le falta ``preguntas.yaml``: cargarlo es un error distinto."""
    shutil.copytree(FX, destino)
    for archivo in destino.glob("*.yaml"):
        contenido = yaml.safe_load(archivo.read_text(encoding="utf-8"))
        contenido["clase"] = "real_anonimizado"
        archivo.write_text(yaml.safe_dump(contenido, allow_unicode=True), encoding="utf-8")
    (destino / "preguntas.yaml").unlink()
    return destino


@pytest.mark.parametrize("remoto", ["embeddings", "reranker", "nli", "llm", "ocr"])
def test_un_adapter_remoto_con_datos_no_sinteticos_aborta_antes_de_cargar_preguntas_y_sin_requests(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], remoto: str
) -> None:
    dataset = dataset_real_sin_preguntas(tmp_path / "ajeno")
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["dataset"]["ruta"] = str(dataset)
    crudo["adaptadores"] = {
        "proveedor": "local",
        "urls": {"embeddings": "http://localhost:1/v1", remoto: NUBE},
    }
    config = tmp_path / "config.yaml"
    config.write_text(yaml.safe_dump(crudo), encoding="utf-8")

    with respx.mock(assert_all_called=False) as http:
        http.route().respond(200)
        codigo = main(
            ["--config", str(config), "--salida", str(tmp_path / "salida")],
            reloj=RelojFijo(),
            raiz=tmp_path / "repo",
        )
        peticiones = len(http.calls)

    mensaje = capsys.readouterr().err
    assert (codigo, peticiones) == (1, 0)
    assert "adapter" in mensaje and "preguntas" not in mensaje
    assert not (tmp_path / "salida").exists()
