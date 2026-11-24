"""``--memoria-del-stack`` (US-278 AC-5): la memoria del stack por brazo que mide ``ai-eval-runner``; lo inválido no corre."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "s7-reranker-ventanas-fake.yaml"


@pytest.mark.parametrize(
    "contenido",
    ['{"B-inexistente": 12.0}', '{"A0": -1}', '{"A0": "doce"}', "[1, 2]", "no es json"],
    ids=["brazo-ajeno", "negativa", "no-numerica", "no-es-mapa", "no-es-json"],
)
def test_la_memoria_del_stack_invalida_se_rechaza_con_codigo_de_uso_y_sin_escribir_informe(
    tmp_path: Path, contenido: str
) -> None:
    memoria = tmp_path / "memoria.json"
    memoria.write_text(contenido, encoding="utf-8")
    salida = tmp_path / "salida"

    codigo = main(
        [
            "--config",
            str(CONFIG),
            "--suite",
            "all",
            "--salida",
            str(salida),
            "--memoria-del-stack",
            str(memoria),
        ],
        reloj=RelojFijo(),
        entorno={"STACK_MEMORY_LIMIT_GB": "30"},
    )

    assert codigo == 2 and not list(salida.glob("*.json"))
