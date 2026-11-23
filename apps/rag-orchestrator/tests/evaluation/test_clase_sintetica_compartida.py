"""La guarda de clase sintética (RN-13, RN-14) tiene un único dueño que usan las familias `diagnostico` y `contextual`."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.evaluation.dataset_contextual import cargar_dataset_contextual
from app.evaluation.dataset_loader import DatasetInvalido, exigir_clase_sintetica
from tests.evaluation.mundo_contextual import escribir_corpus


def test_la_guarda_acepta_la_clase_sintetica() -> None:
    exigir_clase_sintetica("sintetico", "manifest.yaml", "contextual")


@pytest.mark.parametrize("clase", ["real_anonimizado", None])
def test_la_guarda_nombra_el_archivo_y_la_familia_cuando_la_clase_no_es_sintetica(
    clase: object,
) -> None:
    with pytest.raises(DatasetInvalido, match="pares.yaml del dataset de diagnostico"):
        exigir_clase_sintetica(clase, "pares.yaml", "diagnostico")


def test_contextual_se_niega_nombrando_el_corpus_cuando_su_clase_no_es_sintetica(
    tmp_path: Path,
) -> None:
    escribir_corpus(tmp_path / "ds")
    corpus = tmp_path / "ds" / "corpus.yaml"
    contenido = yaml.safe_load(corpus.read_text("utf-8"))
    contenido["clase"] = "real_anonimizado"
    corpus.write_text(yaml.safe_dump(contenido), encoding="utf-8")

    with pytest.raises(DatasetInvalido):
        cargar_dataset_contextual(tmp_path / "ds")
