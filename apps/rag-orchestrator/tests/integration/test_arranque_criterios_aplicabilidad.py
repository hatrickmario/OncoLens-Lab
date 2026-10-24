"""Los criterios de aplicabilidad se leen una sola vez al arrancar y la composición no inventa ``None`` (Gate 2 M5, M6)."""

from pathlib import Path

import pytest

from app.bootstrap import cargar_configuracion_o_salir, crear_app
from tests.support.catalogo_aplicabilidad import APL_1_0_0
from tests.support.fakes import settings_de_prueba
from tests.support.recuperacion import EJEMPLOS

NOMBRE_DEL_ARCHIVO = "aplicabilidad.json"


class _CatalogoFalso:
    """Cumple ``CatalogoClinico`` sin montar ningún directorio."""

    def version(self) -> str:
        return "falso-1.0.0"

    def tipos_de_cancer(self) -> tuple[str, ...]:
        return ("mama",)


def test_arranque_lee_cada_aplicabilidad_json_una_sola_vez_cuando_se_compone_la_app(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lecturas: list[str] = []
    leer_original = Path.read_text

    def leer_y_contar(self: Path, *args: object, **kwargs: object) -> str:
        if self.name == NOMBRE_DEL_ARCHIVO:
            lecturas.append(self.parent.name)
        return leer_original(self, *args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(Path, "read_text", leer_y_contar)
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("CLINICAL_CATALOG_PATH", str(APL_1_0_0))
    monkeypatch.setenv("ENABLED_CANCER_TYPES", "mama,prostata")

    _, montado = cargar_configuracion_o_salir()
    app = crear_app(
        settings_de_prueba(
            llm_provider="fake", fake_responses_path=EJEMPLOS, clinical_catalog_path=APL_1_0_0
        ),
        catalogo_clinico=montado.catalogo,
        criterios_de_aplicabilidad=montado.criterios,
    )

    assert sorted(lecturas) == ["mama", "prostata"]
    assert app.state.criterios_de_aplicabilidad is montado.criterios


def test_criterios_vacios_cuando_el_catalogo_inyectado_no_tiene_ruta_montada() -> None:
    settings = settings_de_prueba(clinical_catalog_path=None)

    app = crear_app(settings, catalogo_clinico=_CatalogoFalso())

    assert app.state.criterios_de_aplicabilidad.criterios("mama") == ()
