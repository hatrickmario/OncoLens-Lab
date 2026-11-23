"""El Markdown del informe `diagnostico` se escribe fuera de ``escribir_reporte_cerrado``: este test protege que no lleve el texto
de ninguna redacción ni de ningún chunk del dataset real (RN-14)."""

from __future__ import annotations

from pathlib import Path

from app.evaluation.dataset_diagnostico import cargar_dataset_diagnostico
from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.support.fakes import RelojFijo

CONFIG_FAKE = RAIZ_APP / "eval" / "configs" / "diagnostico-fake.yaml"


def test_el_markdown_del_informe_no_contiene_preguntas_ni_fragmentos_del_dataset_real(
    tmp_path: Path,
) -> None:
    codigo = main(
        ["--config", str(CONFIG_FAKE), "--suite", "diagnostico", "--salida", str(tmp_path)],
        reloj=RelojFijo(),
    )
    dataset = cargar_dataset_diagnostico(RAIZ_REPO / "data" / "eval" / "parafrasis-v1", 10)
    textos = [r.texto for p in dataset.pares for r in p.redacciones] + [
        c.texto for c in dataset.corpus.chunks
    ]

    markdown = next(tmp_path.glob("*.md")).read_text(encoding="utf-8")

    assert codigo == 0
    assert [t for t in textos if t in markdown] == []
