"""El manifiesto real del corpus ampliado ``data/raw/s3/manifest.yaml`` cumple ADR-36 y los mínimos de US-120 (RN-21, RN-13, RN-14).

Test de DATOS, sin servicios ni embeddings (como ``test_manifiesto_real_de_la_semilla.py``): fallan nombrando la clave del
documento o el archivo, nunca imprimen contenido. Sin ``skip``: el manifiesto existe en el repositorio.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict

import pytest

from app.config.settings import (
    CORPUS_FUENTES_ADMITIDAS_INICIALES,
    CORPUS_MIN_DOCUMENTOS_POR_TIPO_INICIAL,
    CORPUS_MIN_FUENTES_POR_TIPO_INICIAL,
)
from app.domain.corpus_seed.admisibilidad import (
    ClaseDeLicencia,
    evaluar_admisibilidad,
    fuente_admitida,
)
from app.domain.corpus_seed.chunking import normalizar_texto
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.versionado import calcular_checksum
from app.infrastructure.seed_manifest.lector import leer_manifiesto
from tests.support.contract import RAIZ_REPOSITORIO
from tests.support.semilla import (
    AUTOIDENTIFICACION_DE_PDQ,
    CLASES_ACEPTADAS_DE_TEST,
    politica_de_test,
)

DIRECTORIO = RAIZ_REPOSITORIO / "data/raw/s3"
DIRECTORIO_SEMILLA = RAIZ_REPOSITORIO / "data/raw/seed"
CLASES_ACEPTADAS = CLASES_ACEPTADAS_DE_TEST
POLITICA = politica_de_test(fuentes_admitidas=CORPUS_FUENTES_ADMITIDAS_INICIALES)
DOCUMENTOS = leer_manifiesto(DIRECTORIO / "manifest.yaml")
TIPOS = ("mama", "prostata")
CLASES_REDISTRIBUIBLES = CLASES_ACEPTADAS


def _por_tipo() -> dict[str, list[DocumentoDeSemilla]]:
    grupos: dict[str, list[DocumentoDeSemilla]] = defaultdict(list)
    for documento in DOCUMENTOS:
        for etiqueta in documento.cancer_type_tags:
            grupos[etiqueta].append(documento)
    return grupos


@pytest.mark.ac("US-120", 1)
@pytest.mark.parametrize("tipo", TIPOS)
def test_el_corpus_ampliado_tiene_el_minimo_de_documentos_y_de_fuentes_por_tipo_de_cancer(
    tipo: str,
) -> None:
    """[US-120 AC-1]"""
    documentos = _por_tipo()[tipo]
    fuentes = {d.source_name for d in documentos}

    assert len(documentos) >= CORPUS_MIN_DOCUMENTOS_POR_TIPO_INICIAL
    assert len(fuentes) >= CORPUS_MIN_FUENTES_POR_TIPO_INICIAL
    assert fuentes == set(CORPUS_FUENTES_ADMITIDAS_INICIALES)


def test_el_manifiesto_ampliado_conserva_cada_entrada_de_la_semilla_con_su_checksum() -> None:
    semilla = leer_manifiesto(DIRECTORIO_SEMILLA / "manifest.yaml")
    ampliado = {d.document_key: d for d in DOCUMENTOS}

    faltan = [d.document_key for d in semilla if d.document_key not in ampliado]
    cambiadas = [
        d.document_key
        for d in semilla
        if d.document_key in ampliado
        and ampliado[d.document_key].checksum_esperado != d.checksum_esperado
    ]

    assert faltan == [] and cambiadas == []


def test_los_registros_de_ensayos_clinicos_se_ingieren_como_clinical_trial_y_no_como_literatura() -> (
    None
):
    de_ct = [d for d in DOCUMENTOS if d.source_name == "ClinicalTrials.gov"]

    assert de_ct
    assert all(d.source_type == "clinical_trial" for d in de_ct)
    assert all(
        d.source_type != "clinical_trial"
        for d in DOCUMENTOS
        if d.source_name != "ClinicalTrials.gov"
    )


@pytest.mark.ac("US-120", 2)
@pytest.mark.parametrize("documento", DOCUMENTOS, ids=lambda d: d.document_key)
def test_cada_documento_del_corpus_ampliado_declara_licencia_aceptada_con_su_verificacion(
    documento: DocumentoDeSemilla,
) -> None:
    """[US-120 AC-2]"""
    admision = evaluar_admisibilidad(documento, POLITICA)

    assert admision.admitido, admision.motivo
    assert admision.license_class in CLASES_ACEPTADAS
    assert documento.license and documento.license_url
    assert documento.license_url.startswith("https://")


def test_cada_documento_del_corpus_ampliado_registra_cuando_y_con_que_evidencia_se_verifico_la_licencia() -> (
    None
):
    crudo = (DIRECTORIO / "manifest.yaml").read_text(encoding="utf-8")

    assert crudo.count("license_verified_at:") == len(DOCUMENTOS)
    assert crudo.count("license_evidence:") == len(DOCUMENTOS)
    assert crudo.count("downloaded_at:") == len(DOCUMENTOS)


@pytest.mark.ac("US-120", 3)
def test_el_manifiesto_ampliado_declara_nccn_y_esmo_como_excluidas_y_ningun_documento_las_usa() -> (
    None
):
    """[US-120 AC-3]"""
    crudo = (DIRECTORIO / "manifest.yaml").read_text(encoding="utf-8")
    cabecera = crudo.split("documentos:", 1)[0]

    assert "- NCCN" in cabecera and "- ESMO" in cabecera
    for documento in DOCUMENTOS:
        assert documento.source_name.casefold() not in {"nccn", "esmo"}, documento.document_key
        for valor in (documento.external_id, documento.url_original or ""):
            assert not re.search(
                r"nccn\.org|esmo\.org|esmoopen|annalsofoncology|10\.1016/j\.(annonc|esmoop)",
                valor,
                re.I,
            ), documento.document_key


@pytest.mark.ac("US-120", 4)
@pytest.mark.parametrize("documento", DOCUMENTOS, ids=lambda d: d.document_key)
def test_todo_source_name_del_corpus_ampliado_pasa_fuente_admitida(
    documento: DocumentoDeSemilla,
) -> None:
    """[US-120 AC-4]"""
    assert fuente_admitida(documento.source_name, CORPUS_FUENTES_ADMITIDAS_INICIALES)


@pytest.mark.parametrize("documento", DOCUMENTOS, ids=lambda d: d.document_key)
def test_el_texto_de_cada_documento_ampliado_coincide_con_el_checksum_del_manifiesto(
    documento: DocumentoDeSemilla,
) -> None:
    assert documento.ruta_texto is not None
    texto = normalizar_texto((DIRECTORIO / documento.ruta_texto).read_text(encoding="utf-8"))

    assert calcular_checksum(texto) == documento.checksum_esperado


def test_todo_archivo_de_docs_tiene_una_entrada_con_licencia_redistribuible_y_viceversa() -> None:
    declarados = {d.ruta_texto: d for d in DOCUMENTOS}
    en_disco = {f"docs/{ruta.name}" for ruta in (DIRECTORIO / "docs").glob("*")}

    sin_entrada = sorted(en_disco - set(declarados))
    sin_archivo = sorted(set(declarados) - en_disco)
    no_redistribuibles = sorted(
        ruta
        for ruta, d in declarados.items()
        if evaluar_admisibilidad(d, POLITICA).license_class not in CLASES_REDISTRIBUIBLES
    )

    assert sin_entrada == [], f"archivos sin entrada: {sin_entrada}"
    assert sin_archivo == [], f"entradas sin archivo: {sin_archivo}"
    assert no_redistribuibles == [], f"licencia no redistribuible: {no_redistribuibles}"


def test_los_textos_de_la_semilla_son_identicos_en_el_corpus_ampliado() -> None:
    semilla = leer_manifiesto(DIRECTORIO_SEMILLA / "manifest.yaml")

    distintos = [
        d.ruta_texto
        for d in semilla
        if d.ruta_texto
        and (DIRECTORIO_SEMILLA / d.ruta_texto).read_bytes()
        != (DIRECTORIO / d.ruta_texto).read_bytes()
    ]

    assert distintos == []


@pytest.mark.parametrize(
    "documento", [d for d in DOCUMENTOS if d.source_name == "NCI"], ids=lambda d: d.document_key
)
def test_el_cuerpo_de_un_documento_de_nci_ampliado_no_se_autoidentifica_como_pdq(
    documento: DocumentoDeSemilla,
) -> None:
    assert documento.ruta_texto is not None
    cuerpo = " ".join(
        (DIRECTORIO / documento.ruta_texto).read_text(encoding="utf-8").split()
    ).casefold()

    assert [p for p in AUTOIDENTIFICACION_DE_PDQ if p in cuerpo] == []
    assert "pdq" not in documento.title.casefold()


def test_la_atribucion_nombra_cada_documento_del_corpus_ampliado() -> None:
    atribucion = (DIRECTORIO / "ATTRIBUTION.md").read_text(encoding="utf-8")

    assert [d.document_key for d in DOCUMENTOS if f"`{d.document_key}`" not in atribucion] == []


@pytest.mark.parametrize("documento", DOCUMENTOS, ids=lambda d: d.document_key)
def test_cada_documento_del_corpus_ampliado_declara_la_url_https_de_su_origen(
    documento: DocumentoDeSemilla,
) -> None:
    assert documento.url_original is not None and documento.url_original.startswith("https://")


@pytest.mark.ac("US-120", 7)
@pytest.mark.parametrize("idioma", ["es", "en"])
def test_mama_tiene_al_menos_un_documento_por_idioma_con_elegibilidad_her2_y_receptores_hormonales(
    idioma: str,
) -> None:
    """[US-120 AC-7] Comprobación por texto del manifiesto; la extracción de población con el LLM local es la tarea 8.2."""
    patrones = {
        "es": (r"\bHER2\b", r"receptores? hormonales?|receptores? de estr[oó]geno"),
        "en": (r"\bHER2\b", r"hormone receptor|estrogen receptor"),
    }[idioma]
    candidatos = [d for d in _por_tipo()["mama"] if d.language == idioma]

    cumplen = [
        d.document_key
        for d in candidatos
        if d.ruta_texto
        and all(
            re.search(p, (DIRECTORIO / d.ruta_texto).read_text(encoding="utf-8"), re.IGNORECASE)
            for p in patrones
        )
    ]

    assert cumplen, f"sin documento de mama en {idioma} con HER2 y receptores hormonales"


def test_el_corpus_ampliado_no_mezcla_tipos_de_cancer_en_una_misma_entrada() -> None:
    conteo = Counter(len(d.cancer_type_tags) for d in DOCUMENTOS)

    assert set(conteo) == {1}
    assert {t for d in DOCUMENTOS for t in d.cancer_type_tags} == set(TIPOS)
    assert ClaseDeLicencia.CC_BY_NC not in {
        evaluar_admisibilidad(d, POLITICA).license_class for d in DOCUMENTOS
    }
