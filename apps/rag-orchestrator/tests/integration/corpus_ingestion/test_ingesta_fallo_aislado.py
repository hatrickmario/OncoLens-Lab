"""Un fallo de un documento no detiene el lote y el resumen cuenta por estado (US-117a AC-4, L1D-116)."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from app.application.corpus_ingestion.reporte import Estado
from tests.integration.corpus_ingestion.conftest import Montaje, montar
from tests.support.ingesta import MANIFIESTO_FX_06C_B_CON_FALLO
from tests.support.semilla import DIRECTORIO_DE_FIXTURES

TEXTO_CORREGIDO = (
    "Texto sintético corregido de un artículo que ahora sí es UTF-8 válido y tiene palabras."
)


@pytest.mark.ac("US-117a", 4)
def test_ingesta_normalizacion_fallida_queda_error_y_resumen_cuenta_por_estado(
    montaje: Montaje,
) -> None:
    """[US-117a AC-4] Un documento cuya normalización falla queda en error y los demás terminan."""
    reporte = montaje.ingerir(MANIFIESTO_FX_06C_B_CON_FALLO)

    roto = reporte.resultado_de("i-roto")
    assert roto.estado is Estado.ERROR
    assert roto.motivo == "normalizacion: UnicodeDecodeError"
    (fila_rota,) = [r for i, r in montaje.catalogo.documentos.items() if i.startswith("i-roto@")]
    assert (fila_rota.status, fila_rota.is_current) == ("error", False)
    assert "i-roto" not in montaje.chunks_por_clave()
    assert reporte.contadores() == {
        "embebido": 4,
        "omitido": 0,
        "rechazado_licencia": 2,
        "error": 1,
    }
    assert reporte.hubo_errores
    salida = json.dumps(reporte.como_diccionario(), ensure_ascii=False)
    for texto in ("Resumen sintético", "Synthetic", "Texto sintético", "bytes que no son"):
        assert texto not in salida


@pytest.mark.ac("US-117a", 4)
def test_ingesta_documento_en_error_se_reintenta_en_la_siguiente_ingesta(tmp_path: Path) -> None:
    """[US-117a AC-4] [US-117a AC-2] (asumido) Un documento en error se reintenta en la siguiente ingesta."""
    directorio = tmp_path / "fixtures"
    shutil.copytree(DIRECTORIO_DE_FIXTURES, directorio)
    montaje = montar(directorio)
    montaje.ingerir(MANIFIESTO_FX_06C_B_CON_FALLO)
    (directorio / "ingest-textos" / "i-roto.txt").write_text(TEXTO_CORREGIDO, encoding="utf-8")

    reporte = montaje.ingerir(MANIFIESTO_FX_06C_B_CON_FALLO)

    assert reporte.resultado_de("i-roto").estado is Estado.EMBEBIDO
    assert {reporte.resultado_de(c).estado for c in ("i-ct-1", "i-lit-1", "i-lit-2", "i-gl-1")} == {
        Estado.OMITIDO
    }
    vigentes = [
        r
        for i, r in montaje.catalogo.documentos.items()
        if i.startswith("i-roto@") and r.is_current
    ]
    assert [r.status for r in vigentes] == ["embebido"]
    assert "i-roto" in montaje.chunks_por_clave()
