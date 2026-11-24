"""``RERANKER_CHUNK_WINDOWS`` y ``RERANKER_WINDOW_OVERLAP`` desde el entorno (US-278 AC-2, RN-22)."""

import pytest
from pydantic import ValidationError

from app.config.errores_de_configuracion import describir_errores
from app.config.settings import Settings
from tests.support.modelos import CLAVES_ADR39_DE_PRUEBA

_ENTORNO_DE_MODELOS = {
    **CLAVES_ADR39_DE_PRUEBA,
    "MODEL_CACHE_DIR": "/modelos",
    "DATA_CACHE_DIR": "/modelos",
}


def _settings(monkeypatch: pytest.MonkeyPatch, **entorno: str) -> Settings:
    for nombre in ("RERANKER_CHUNK_WINDOWS", "RERANKER_WINDOW_OVERLAP"):
        monkeypatch.delenv(nombre, raising=False)
    for nombre, valor in entorno.items():
        monkeypatch.setenv(nombre, valor)
    return Settings(_env_file=None)  # type: ignore[call-arg]


def test_el_modo_es_primera_y_el_solape_64_cuando_el_entorno_no_define_nada(monkeypatch) -> None:
    ajustes = _settings(monkeypatch)

    assert (ajustes.reranker_chunk_windows, ajustes.reranker_window_overlap) == ("primera", 64)


def test_el_modo_y_el_solape_salen_del_entorno_cuando_se_definen(monkeypatch) -> None:
    ajustes = _settings(monkeypatch, RERANKER_CHUNK_WINDOWS="maximo", RERANKER_WINDOW_OVERLAP="32")

    assert (ajustes.reranker_chunk_windows, ajustes.reranker_window_overlap) == ("maximo", 32)


@pytest.mark.parametrize("valor", ["promedio", "Maximo", "media-de-ventanas"])
def test_un_modo_fuera_del_conjunto_impide_el_arranque_nombrando_la_clave_y_no_el_valor(
    monkeypatch, valor: str
) -> None:
    with pytest.raises(ValidationError) as error:
        _settings(monkeypatch, RERANKER_CHUNK_WINDOWS=valor)

    eventos = describir_errores(error.value)
    assert [e["variable"] for e in eventos] == ["RERANKER_CHUNK_WINDOWS"]
    assert valor not in str(eventos) and valor not in str(error.value)


def test_un_solape_negativo_impide_el_arranque_nombrando_la_clave(monkeypatch) -> None:
    with pytest.raises(ValidationError) as error:
        _settings(monkeypatch, RERANKER_WINDOW_OVERLAP="-1")

    assert [e["variable"] for e in describir_errores(error.value)] == ["RERANKER_WINDOW_OVERLAP"]


@pytest.mark.parametrize("solape", ["512", "600"])
def test_un_solape_que_no_es_menor_que_el_maximo_del_reranker_impide_el_arranque(
    monkeypatch, solape: str
) -> None:
    with pytest.raises(ValidationError) as error:
        _settings(monkeypatch, **_ENTORNO_DE_MODELOS, RERANKER_WINDOW_OVERLAP=solape)

    regla = describir_errores(error.value)[0]["regla"]
    assert "RERANKER_WINDOW_OVERLAP" in regla and solape not in regla


def test_un_solape_menor_que_el_maximo_del_reranker_arranca(monkeypatch) -> None:
    ajustes = _settings(monkeypatch, **_ENTORNO_DE_MODELOS, RERANKER_WINDOW_OVERLAP="511")

    assert ajustes.reranker_window_overlap == 511
