"""Ingesta del manifiesto real del corpus ampliado ``data/raw/s3/manifest.yaml`` (US-120 AC-1 y AC-2, FR-19, RN-21, RN-05).

*Embeddings* y *sparse* falsos deterministas y almacén de chunks fingido en su puerto; el catálogo es la memoria o el
PostgreSQL ``corpus`` real (``fabrica_de_montaje``). Solo se miran identificadores, estados y contadores: nunca contenido.
"""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Callable
from dataclasses import replace
from typing import Any

import pytest

from app.application.corpus_ingestion.reporte import Estado
from app.application.corpus_ingestion.resumen_corpus import contar_corpus_por_tipo_y_fuente
from app.config.settings import (
    CORPUS_FUENTES_ADMITIDAS_INICIALES,
    CORPUS_MIN_DOCUMENTOS_POR_TIPO_INICIAL,
    CORPUS_MIN_FUENTES_POR_TIPO_INICIAL,
)
from app.infrastructure.seed_manifest.lector import leer_manifiesto
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.contract import RAIZ_REPOSITORIO
from tests.support.semilla import politica_de_test

DIRECTORIO_S3 = RAIZ_REPOSITORIO / "data/raw/s3"
MANIFIESTO_S3 = DIRECTORIO_S3 / "manifest.yaml"
DIRECTORIO_SEMILLA = RAIZ_REPOSITORIO / "data/raw/seed"
MANIFIESTO_SEMILLA = DIRECTORIO_SEMILLA / "manifest.yaml"
TIPOS = ("mama", "prostata")
CHUNK_GRANDE = (
    800  # palabras: acota los chunks del corpus real a unos cientos y no a decenas de miles
)
CLASES_ACEPTADAS = {"dominio_publico", "cc_by", "cc_by_sa"}


def _politica() -> Any:
    return politica_de_test(fuentes_admitidas=CORPUS_FUENTES_ADMITIDAS_INICIALES)


def _vigentes_por_tipo(montaje: Montaje) -> dict[str, list[Any]]:
    por_tipo: dict[str, list[Any]] = defaultdict(list)
    for fila in montaje.catalogo.documentos_vigentes_con_poblacion():
        por_tipo[fila.cancer_type_tags].append(fila)
    return por_tipo


@pytest.mark.ac("US-120", 1)
def test_ingesta_del_manifiesto_real_deja_el_minimo_por_tipo_de_cancer_y_fuente_cuando_se_ingiere_con_embeddings_falsos(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-120 AC-1] Mama y próstata quedan con ≥ 20 documentos ``embebido`` e ``is_current`` de ≥ 3 ``source_name``, y el
    resumen JSON trae los contadores por tipo y fuente sin contenido ni URLs."""
    montaje = fabrica_de_montaje(DIRECTORIO_S3, _politica(), CHUNK_GRANDE)

    reporte = montaje.ingerir(MANIFIESTO_S3)

    assert not reporte.hubo_errores, reporte.contadores()
    por_tipo = _vigentes_por_tipo(montaje)
    for tipo in TIPOS:
        filas = por_tipo[tipo]
        assert len(filas) >= CORPUS_MIN_DOCUMENTOS_POR_TIPO_INICIAL
        assert len({f.source_name for f in filas}) >= CORPUS_MIN_FUENTES_POR_TIPO_INICIAL
    resumen = contar_corpus_por_tipo_y_fuente(montaje.catalogo.documentos_vigentes_con_poblacion())
    assert {t: sum(por_fuente.values()) for t, por_fuente in resumen.items()} == {
        t: len(f) for t, f in por_tipo.items()
    }
    assert set(resumen) == set(TIPOS)
    assert all(
        set(por_fuente) == set(CORPUS_FUENTES_ADMITIDAS_INICIALES)
        for por_fuente in resumen.values()
    )
    serializado = json.dumps(resumen)
    assert "http" not in serializado and "@" not in serializado


def test_el_resumen_por_tipo_y_fuente_sigue_al_catalogo_cuando_la_reingesta_de_un_documento_vigente_falla(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """Un documento vigente cuya nueva versión falla la integridad sigue vigente en el catálogo y el resumen lo cuenta."""
    montaje = fabrica_de_montaje(DIRECTORIO_S3, _politica(), CHUNK_GRANDE)
    montaje.ingerir(MANIFIESTO_S3)
    antes = contar_corpus_por_tipo_y_fuente(montaje.catalogo.documentos_vigentes_con_poblacion())
    afectado = montaje.documentos(MANIFIESTO_S3)[0].document_key
    documentos = [
        replace(d, checksum_esperado="0" * 64) if d.document_key == afectado else d
        for d in montaje.documentos(MANIFIESTO_S3)
    ]

    reporte = montaje.servicio.ingerir(documentos)

    assert reporte.resultado_de(afectado).estado is Estado.ERROR
    despues = contar_corpus_por_tipo_y_fuente(montaje.catalogo.documentos_vigentes_con_poblacion())
    assert despues == antes
    assert sum(sum(por_fuente.values()) for por_fuente in despues.values()) == len(
        montaje.catalogo.documentos_vigentes_con_poblacion()
    )


@pytest.mark.ac("US-120", 2)
def test_ingesta_del_manifiesto_real_deja_la_licencia_completa_en_el_catalogo_y_ninguna_fuente_excluida(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-120 AC-2] Cada fila vigente lleva licencia, clase aceptada y URL; ninguna es NCCN ni ESMO."""
    montaje = fabrica_de_montaje(DIRECTORIO_S3, _politica(), CHUNK_GRANDE)

    montaje.ingerir(MANIFIESTO_S3)

    filas = montaje.catalogo.documentos_vigentes_con_poblacion()
    assert filas
    incompletas = [f.document_id for f in filas if not (f.license and f.license_url)]
    fuera_de_clase = [f.document_id for f in filas if f.license_class not in CLASES_ACEPTADAS]
    excluidas = [f.document_id for f in filas if f.source_name.casefold() in {"nccn", "esmo"}]
    assert incompletas == [] and fuera_de_clase == [] and excluidas == []
    assert {f.source_type for f in filas if f.source_name == "ClinicalTrials.gov"} == {
        "clinical_trial"
    }


def test_ingesta_del_manifiesto_real_no_duplica_ni_reindexa_la_semilla_ya_vigente(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """RN-05: con la semilla vigente, el manifiesto ampliado la omite y no crea ninguna fila duplicada."""
    montaje = fabrica_de_montaje(DIRECTORIO_S3, _politica(), CHUNK_GRANDE)
    semilla = leer_manifiesto(MANIFIESTO_SEMILLA)
    ampliado = leer_manifiesto(MANIFIESTO_S3)
    montaje.servicio.ingerir(semilla)
    chunks_de_la_semilla = {c: n for c, n in montaje.chunks_por_clave().items()}

    reporte = montaje.ingerir(MANIFIESTO_S3)

    for documento in semilla:
        assert reporte.resultado_de(documento.document_key).estado is Estado.OMITIDO
        assert montaje.filas_de(documento.document_key) == [("embebido", True)]
    assert montaje.total_de_filas() == len(ampliado)
    assert {c: montaje.chunks_por_clave()[c] for c in chunks_de_la_semilla} == chunks_de_la_semilla
