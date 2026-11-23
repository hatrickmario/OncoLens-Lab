"""La familia `diagnostico` con proveedor local cumple RN-12 (US-276): sin los modelos locales o con una ruta hacia la nube la
suite termina con código distinto de 0 nombrando lo que falta, sin informe y sin recurrir a un proveedor de nube. El monitor de red
del `conftest` falla el test si algo intenta salir de loopback."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

CONFIG_LOCAL = RAIZ_APP / "eval" / "configs" / "diagnostico-local.yaml"


def correr_local(tmp_path: Path, config: Path = CONFIG_LOCAL) -> int:
    return main(
        ["--config", str(config), "--suite", "diagnostico", "--salida", str(tmp_path / "s")],
        reloj=RelojFijo(),
        entorno={},  # sin las variables de los pesos de ADR-39
    )


def test_sin_los_pesos_locales_la_suite_termina_con_error_nombrando_lo_que_falta_y_no_escribe_informe(
    tmp_path: Path, capsys: Any
) -> None:
    codigo = correr_local(tmp_path)

    assert codigo != 0
    assert "NLI_MODEL_PATH" in capsys.readouterr().err
    assert list((tmp_path / "s").glob("*")) == []


def test_con_el_llm_en_la_nube_la_suite_se_niega_antes_de_cargar_nada(
    tmp_path: Path, capsys: Any
) -> None:
    crudo: dict[str, Any] = yaml.safe_load(CONFIG_LOCAL.read_text(encoding="utf-8"))
    crudo["adaptadores"]["urls"]["llm"] = "https://api.nube-de-prueba.invalid/v1"
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")

    codigo = correr_local(tmp_path, ruta)

    assert codigo == 1
    assert "RN-12" in capsys.readouterr().err
    assert list((tmp_path / "s").glob("*")) == []
