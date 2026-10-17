"""El paquete ``infrastructure/milvus`` nunca elimina colecciones (US-058 D5)."""

from pathlib import Path

import pytest


@pytest.mark.ac("US-058", 5)
def test_milvus_repository_paquete_no_elimina_colecciones() -> None:
    paquete = Path(__file__).resolve().parents[2] / "app" / "infrastructure" / "milvus"
    fuentes = {ruta.name: ruta.read_text(encoding="utf-8") for ruta in paquete.glob("*.py")}

    ofensores = [nombre for nombre, texto in fuentes.items() if "drop_collection" in texto]

    assert fuentes and ofensores == []
