"""El manifiesto real ``data/raw/seed/manifest.yaml`` cumple la regla de licencias de ADR-36 (RN-21, RN-13, RN-14).

Es un test de DATOS, sin servicios ni embeddings: el smoke de US-059 AC-1 con el modelo real lo corre L1D-106.
"""

from __future__ import annotations

from collections import Counter

import pytest

from app.config.settings import MAPA_DE_LICENCIAS_POR_DEFECTO
from app.domain.corpus_seed.admisibilidad import PoliticaDeLicencias, evaluar_admisibilidad
from app.domain.corpus_seed.chunking import normalizar_texto
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.versionado import calcular_checksum
from app.infrastructure.seed_manifest.lector import leer_manifiesto
from tests.support.contract import RAIZ_REPOSITORIO

DIRECTORIO = RAIZ_REPOSITORIO / "data/raw/seed"
POLITICA = PoliticaDeLicencias(
    aceptadas=frozenset({"dominio_publico", "cc_by", "cc_by_sa"}),
    excluidas=("NCCN", "ESMO"),
    mapa_de_clases=MAPA_DE_LICENCIAS_POR_DEFECTO,
)
DOCUMENTOS = leer_manifiesto(DIRECTORIO / "manifest.yaml")


def test_la_semilla_real_tiene_unos_diez_documentos_de_mama_y_de_prostata_y_al_menos_uno_en_espanol() -> (
    None
):
    por_cancer = Counter(tag for d in DOCUMENTOS for tag in d.cancer_type_tags)

    assert 8 <= len(DOCUMENTOS) <= 12
    assert por_cancer["mama"] >= 4 and por_cancer["prostata"] >= 4
    assert any(d.language == "es" for d in DOCUMENTOS)


@pytest.mark.parametrize("documento", DOCUMENTOS, ids=lambda d: d.document_key)
def test_cada_documento_de_la_semilla_real_es_admisible_con_la_politica_de_adr_36(
    documento: DocumentoDeSemilla,
) -> None:
    admision = evaluar_admisibilidad(documento, POLITICA)

    assert admision.admitido, admision.motivo
    assert admision.license_class in {"dominio_publico", "cc_by", "cc_by_sa"}


def test_ningun_documento_de_la_semilla_real_viene_de_nccn_ni_de_esmo_ni_usa_la_marca_pdq() -> None:
    for documento in DOCUMENTOS:
        assert documento.source_name.casefold() not in {"nccn", "esmo"}
        assert documento.source_name == "NCI" or documento.source_name == "PMC Open Access"
        assert "PDQ" not in documento.title and "PDQ" not in documento.source_name


@pytest.mark.parametrize("documento", DOCUMENTOS, ids=lambda d: d.document_key)
def test_el_texto_de_cada_documento_coincide_con_el_checksum_del_manifiesto(
    documento: DocumentoDeSemilla,
) -> None:
    assert documento.ruta_texto is not None
    texto = normalizar_texto((DIRECTORIO / documento.ruta_texto).read_text(encoding="utf-8"))

    assert calcular_checksum(texto) == documento.checksum_esperado


@pytest.mark.parametrize("documento", DOCUMENTOS, ids=lambda d: d.document_key)
def test_cada_documento_de_la_semilla_real_declara_licencia_url_y_su_verificacion(
    documento: DocumentoDeSemilla,
) -> None:
    crudo = (DIRECTORIO / "manifest.yaml").read_text(encoding="utf-8")

    assert documento.license and documento.license_url
    assert crudo.count("license_verified_at:") == len(DOCUMENTOS)
    assert crudo.count("license_evidence:") == len(DOCUMENTOS)


def test_la_atribucion_nombra_cada_documento_de_la_semilla_real() -> None:
    atribucion = (DIRECTORIO / "ATTRIBUTION.md").read_text(encoding="utf-8")

    assert all(f"`{d.document_key}`" in atribucion for d in DOCUMENTOS)
