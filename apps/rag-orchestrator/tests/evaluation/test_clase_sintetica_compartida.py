"""La guarda de clase sintética (RN-13, RN-14) tiene un único dueño que usan las familias `diagnostico` y `contextual`."""

from __future__ import annotations

import pytest

from app.evaluation.dataset_loader import DatasetInvalido, exigir_clase_sintetica


def test_la_guarda_acepta_la_clase_sintetica() -> None:
    exigir_clase_sintetica({"clase": "sintetico"}, "manifest.yaml", "contextual")


@pytest.mark.parametrize("crudo", [{"clase": "real_anonimizado"}, {}])
def test_la_guarda_nombra_el_archivo_y_la_familia_cuando_la_clase_no_es_sintetica(
    crudo: dict[str, str],
) -> None:
    with pytest.raises(DatasetInvalido, match="pares.yaml del dataset de diagnostico"):
        exigir_clase_sintetica(crudo, "pares.yaml", "diagnostico")
