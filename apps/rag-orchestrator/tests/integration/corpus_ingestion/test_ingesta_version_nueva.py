"""Versión nueva de un documento por la ingesta del S3 (US-117b AC-1, RN-05, ADR-5): caracterización de la regla que ya
existe (``decidir_version`` / ``reemplazar_version``). Orden real: ``upsert`` de la versión nueva -> apagar la anterior ->
``reemplazar_version`` en el catálogo (D1).
"""

from __future__ import annotations

import pytest

from app.application.corpus_ingestion.reporte import Estado
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.fakes import RelojFijo
from app.infrastructure.seed_manifest.lector import leer_manifiesto
from tests.support.ingesta import (
    MANIFIESTO_FX_06C_B_V2,
    documentos_fx_06c_b,
    fragmentos_de_i_gl_1_v2,
    fragmentos_esperados_fx_06c_b,
)
from tests.support.semilla import EmbedderFalso

CLAVE = "i-gl-1"


def _vigentes_y_no_vigentes(montaje: Montaje) -> tuple[int, int]:
    estados = [vigente for _, vigente in montaje.filas_de(CLAVE)]
    return estados.count(True), estados.count(False)


@pytest.mark.ac("US-117b", 1)
def test_ingesta_de_i_gl_1_v2_la_deja_vigente_y_a_i_gl_1_no_vigente_con_superseded_at_sin_borrar_chunks_ni_filas(
    montaje_en_ambos: Montaje,
) -> None:
    montaje = montaje_en_ambos
    montaje.ingerir()
    filas_antes = montaje.total_de_filas()
    chunks_antes = montaje.chunks_por_clave()[CLAVE]

    reporte = montaje.ingerir(MANIFIESTO_FX_06C_B_V2)

    assert reporte.resultado_de(CLAVE).estado is Estado.EMBEBIDO
    filas = montaje.filas_de(CLAVE)
    assert sorted(filas) == [("embebido", False), ("embebido", True)]
    assert sorted(montaje.superseded_at_de(CLAVE), key=lambda v: (v is not None, str(v))) == [
        None,
        RelojFijo().ahora(),
    ]
    assert montaje.total_de_filas() == filas_antes + 1
    chunks_v2 = len(fragmentos_de_i_gl_1_v2())
    assert chunks_v2 > 0
    assert montaje.chunks_por_clave()[CLAVE] == chunks_antes + chunks_v2
    assert montaje.chunks_vigentes_por_clave()[CLAVE] == chunks_v2


def test_la_busqueda_dense_no_devuelve_chunks_de_i_gl_1_tras_ingerir_su_version_nueva(
    montaje_en_ambos: Montaje,
) -> None:
    montaje = montaje_en_ambos
    montaje.ingerir()
    texto_de_v1 = fragmentos_esperados_fx_06c_b(CLAVE)[CLAVE][0]
    vector = EmbedderFalso().embeber([texto_de_v1])[0]
    antes = montaje.almacen.search_dense(vector, 50)
    assert any(r.document_id.startswith(f"{CLAVE}@") for r in antes)
    ids_de_v1 = {r.document_id for r in antes if r.document_id.startswith(f"{CLAVE}@")}

    montaje.ingerir(MANIFIESTO_FX_06C_B_V2)

    despues = montaje.almacen.search_dense(vector, 50)
    del_grupo = {r.document_id for r in despues if r.document_id.startswith(f"{CLAVE}@")}
    assert del_grupo and del_grupo.isdisjoint(ids_de_v1)


def test_milvus_que_falla_al_apagar_deja_v2_en_error_v1_vigente_y_un_reintento_lo_reconcilia(
    montaje: Montaje,
) -> None:
    montaje.ingerir()
    chunks_de_v1 = montaje.chunks_por_clave()[CLAVE]
    montaje.almacen.fallar_en["marcar_no_vigentes"] = ConnectionError("milvus caído")

    documentos = [*leer_manifiesto(MANIFIESTO_FX_06C_B_V2), *documentos_fx_06c_b("i-ct-1")]

    reporte = montaje.servicio.ingerir(documentos)

    assert reporte.resultado_de(CLAVE).estado is Estado.ERROR
    assert reporte.resultado_de("i-ct-1").estado is Estado.OMITIDO  # la ingesta sigue con el resto
    assert (
        _vigentes_y_no_vigentes(montaje)[0] == 1
    )  # el catálogo conserva a v1 como la única vigente
    assert not any(v is not None for v in montaje.superseded_at_de(CLAVE))
    assert montaje.chunks_por_clave()[CLAVE] > chunks_de_v1  # nada se borró; v2 ya está escrita
    assert montaje.chunks_vigentes_por_clave()[CLAVE] == montaje.chunks_por_clave()[CLAVE]
    del montaje.almacen.fallar_en["marcar_no_vigentes"]
    reintento = montaje.ingerir(MANIFIESTO_FX_06C_B_V2)

    assert reintento.resultado_de(CLAVE).estado is Estado.EMBEBIDO
    assert _vigentes_y_no_vigentes(montaje)[0] == 1
    assert montaje.chunks_vigentes_por_clave()[CLAVE] == len(fragmentos_de_i_gl_1_v2())
