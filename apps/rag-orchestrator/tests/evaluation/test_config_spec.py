"""Las tres cargas de configuración (fase A, A2 y A3) construyen el ``ModeloSpec`` con la misma función."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from app.evaluation.config_medicion import spec_desde_yaml
from app.evaluation.fase_a2 import cargar_config_a2
from app.evaluation.fase_a3 import cargar_config_a3

from tests.evaluation.conftest import RAIZ_APP

PLANTILLA = "Instruct: pregunta clinica\nQuery:{texto}"


def _con_plantilla(origen: str, tmp_path: Path) -> Path:
    contenido = yaml.safe_load((RAIZ_APP / "eval" / "configs" / origen).read_text(encoding="utf-8"))
    contenido["embedding"]["plantilla_consulta"] = PLANTILLA
    contenido["embedding"]["plantilla_documento"] = "Doc: {texto}"
    destino = tmp_path / origen
    destino.write_text(yaml.safe_dump(contenido, allow_unicode=True), encoding="utf-8")
    return destino


def test_spec_desde_yaml_conserva_las_plantillas_del_modelo() -> None:
    spec = spec_desde_yaml(
        "embeddings",
        {"id": "B", "modelo": "x/y", "revision": "a" * 40, "tarea": "embedding", "max_length": 8, "plantilla_consulta": PLANTILLA},
    )

    assert spec.plantilla_consulta == PLANTILLA and spec.plantilla_documento == "{texto}"


def test_spec_desde_yaml_rechaza_una_tarea_desconocida() -> None:
    with pytest.raises(ValueError, match="tarea desconocida"):
        spec_desde_yaml("nli", {"id": "A", "modelo": "x/y", "revision": "a" * 40, "tarea": "otra", "max_length": 8})


def test_fase_a2_conserva_la_plantilla_de_consulta_del_embedding(tmp_path: Path) -> None:
    config = cargar_config_a2(_con_plantilla("adr39-fase-a2.yaml", tmp_path))

    assert config.spec.plantilla_consulta == PLANTILLA and config.spec.plantilla_documento == "Doc: {texto}"


def test_fase_a3_conserva_la_plantilla_de_consulta_del_embedding(tmp_path: Path) -> None:
    config = cargar_config_a3(_con_plantilla("adr39-fase-a3.yaml", tmp_path))

    assert config.embedding.plantilla_consulta == PLANTILLA and config.embedding.plantilla_documento == "Doc: {texto}"
