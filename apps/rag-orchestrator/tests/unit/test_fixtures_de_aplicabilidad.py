"""Las fixtures test-apl-* del rag-orchestrator son copia exacta de las de clinical-catalogs (L1D-126, 2.1)."""

import hashlib
from pathlib import Path

import pytest

from tests.support.catalogo_aplicabilidad import APL_1_0_0, APL_1_0_1, ORIGEN_DE_LAS_FIXTURES


def _huellas(raiz: Path) -> dict[str, str]:
    return {
        str(archivo.relative_to(raiz)): hashlib.sha256(archivo.read_bytes()).hexdigest()
        for archivo in sorted(raiz.rglob("*"))
        if archivo.is_file()
    }


@pytest.mark.parametrize("copia", [APL_1_0_0, APL_1_0_1], ids=lambda ruta: ruta.name)
def test_fixture_de_aplicabilidad_es_copia_exacta_del_origen_cuando_se_compara_el_checksum(
    copia: Path,
) -> None:
    origen = ORIGEN_DE_LAS_FIXTURES / copia.name

    assert _huellas(origen), "el origen no tiene archivos"
    assert _huellas(copia) == _huellas(origen)
