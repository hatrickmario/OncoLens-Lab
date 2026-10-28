"""Lector del manifiesto de la semilla (US-059 D9): valida la forma antes de tocar PostgreSQL o Milvus."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from app.infrastructure.seed_manifest.lector import ManifiestoInvalido, leer_manifiesto

MANIFIESTO_FX_06C_A = Path(__file__).resolve().parents[1] / "fixtures" / "seed-manifest.yaml"

DOCUMENTO_VALIDO = """\
documentos:
  - document_key: d-1
    source_type: literature
    source_name: PMC Open Access
    external_id: 10.0000/sintetico
    title: Sintético
    language: en
    cancer_type_tags: [mama]
    published_at: 2024-01-02
    study_design: eca
    population: adulto
    original_format: jats_xml
    license: CC BY 4.0
    text_path: docs/d-1.txt
"""


def escribir(tmp_path: Path, contenido: str) -> Path:
    ruta = tmp_path / "manifest.yaml"
    ruta.write_text(contenido, encoding="utf-8")
    return ruta


def test_lee_los_seis_documentos_del_fixture_con_licencia_y_criterios_tal_como_se_declaran() -> (
    None
):
    documentos = {d.document_key: d for d in leer_manifiesto(MANIFIESTO_FX_06C_A)}

    assert list(documentos) == ["t-ok-1", "t-ok-2", "t-nd", "t-sin-licencia", "t-nccn", "t-ok-1-v2"]
    assert documentos["t-ok-2"].population_criteria == {
        "estadio": "metastasico",
        "linea": "primera",
    }
    assert documentos["t-ok-1"].population_criteria is None
    assert documentos["t-sin-licencia"].license is None
    assert documentos["t-nd"].license == "CC BY-ND 4.0"


def test_el_grupo_de_versiones_es_la_propia_clave_salvo_que_el_manifiesto_lo_declare() -> None:
    documentos = {d.document_key: d for d in leer_manifiesto(MANIFIESTO_FX_06C_A)}

    assert documentos["t-ok-1"].version_group_id == "t-ok-1"
    assert documentos["t-ok-1-v2"].version_group_id == "t-ok-1"


def test_interpreta_la_fecha_de_publicacion_como_fecha(tmp_path: Path) -> None:
    documento = leer_manifiesto(escribir(tmp_path, DOCUMENTO_VALIDO))[0]

    assert documento.published_at == date(2024, 1, 2) and documento.ruta_texto == "docs/d-1.txt"


@pytest.mark.parametrize(
    ("campo_faltante", "mensaje"),
    [
        ("    title: Sintético\n", "faltan title"),
        ("    study_design: eca\n", "faltan study_design"),
    ],
)
def test_rechaza_un_documento_sin_campo_obligatorio(
    tmp_path: Path, campo_faltante: str, mensaje: str
) -> None:
    with pytest.raises(ManifiestoInvalido, match=mensaje):
        leer_manifiesto(escribir(tmp_path, DOCUMENTO_VALIDO.replace(campo_faltante, "")))


@pytest.mark.parametrize(
    "texto",
    ["", "    text_path: docs/a.txt\n    source_url: https://x.test/a\n"],
)
def test_rechaza_un_documento_sin_texto_o_con_dos_fuentes_de_texto(
    tmp_path: Path, texto: str
) -> None:
    contenido = DOCUMENTO_VALIDO.replace("    text_path: docs/d-1.txt\n", texto)

    with pytest.raises(ManifiestoInvalido, match="exactamente uno"):
        leer_manifiesto(escribir(tmp_path, contenido))


def test_un_documento_sin_licencia_es_valido_porque_el_dominio_lo_rechaza_con_su_motivo(
    tmp_path: Path,
) -> None:
    contenido = DOCUMENTO_VALIDO.replace("    license: CC BY 4.0\n", "")

    assert leer_manifiesto(escribir(tmp_path, contenido))[0].license is None


@pytest.mark.parametrize(
    ("viejo", "nuevo", "mensaje"),
    [
        ("study_design: eca", "study_design: ensayo", "study_design fuera del catálogo"),
        ("language: en", "language: fr", "language fuera del catálogo"),
        (
            "original_format: jats_xml",
            "original_format: docx",
            "original_format fuera del catálogo",
        ),
        ("document_key: d-1", "document_key: d/1", "document_key"),
        ("published_at: 2024-01-02", "published_at: ayer", "published_at no es una fecha"),
        ("license: CC BY 4.0", "licence: CC BY 4.0", "claves desconocidas licence"),
        ("cancer_type_tags: [mama]", "cancer_type_tags: []", "cancer_type_tags"),
        ("document_key: d-1", "document_key: ..", "document_key debe cumplir"),
        ("document_key: d-1", "document_key: '.'", "document_key debe cumplir"),
    ],
)
def test_rechaza_valores_fuera_del_catalogo_claves_desconocidas_y_claves_mal_formadas(
    tmp_path: Path, viejo: str, nuevo: str, mensaje: str
) -> None:
    with pytest.raises(ManifiestoInvalido, match=mensaje):
        leer_manifiesto(escribir(tmp_path, DOCUMENTO_VALIDO.replace(viejo, nuevo)))


def test_lee_el_checksum_declarado_del_texto(tmp_path: Path) -> None:
    contenido = DOCUMENTO_VALIDO + f"    checksum: {'ab' * 32}\n"

    assert leer_manifiesto(escribir(tmp_path, contenido))[0].checksum_esperado == "ab" * 32


@pytest.mark.parametrize("valor", ["abc", "AB" * 32, "zz" * 32])
def test_rechaza_un_checksum_que_no_es_sha256_hexadecimal_en_minusculas(
    tmp_path: Path, valor: str
) -> None:
    with pytest.raises(ManifiestoInvalido, match="checksum"):
        leer_manifiesto(escribir(tmp_path, DOCUMENTO_VALIDO + f"    checksum: {valor}\n"))


@pytest.mark.parametrize(
    "clave",
    ["sk-SECRETO/../etc", "con espacios y ñ", "x" * 200, "pw=hunter2!"],
)
def test_un_error_sobre_un_document_key_invalido_no_lo_repite_en_el_mensaje(
    tmp_path: Path, clave: str
) -> None:
    contenido = DOCUMENTO_VALIDO.replace("document_key: d-1", f"document_key: '{clave}'")
    contenido = contenido.replace("    title: Sintético\n", "")  # fuerza un error "faltan title"

    with pytest.raises(ManifiestoInvalido) as error:
        leer_manifiesto(escribir(tmp_path, contenido))

    assert clave not in str(error.value) and str(error.value).startswith("documento #1:")


def test_un_document_key_valido_si_se_nombra_en_el_error(tmp_path: Path) -> None:
    contenido = DOCUMENTO_VALIDO.replace("    title: Sintético\n", "")

    with pytest.raises(ManifiestoInvalido, match=r"^d-1: faltan title"):
        leer_manifiesto(escribir(tmp_path, contenido))


def test_rechaza_criterios_de_poblacion_que_no_son_de_las_seis_claves(tmp_path: Path) -> None:
    contenido = DOCUMENTO_VALIDO + "    population_criteria: {sexo: femenino}\n"

    with pytest.raises(ManifiestoInvalido, match="population_criteria"):
        leer_manifiesto(escribir(tmp_path, contenido))


def test_rechaza_una_clave_de_documento_repetida(tmp_path: Path) -> None:
    documento = DOCUMENTO_VALIDO.removeprefix("documentos:\n")

    with pytest.raises(ManifiestoInvalido, match="repetido: d-1"):
        leer_manifiesto(escribir(tmp_path, "documentos:\n" + documento + documento))


@pytest.mark.parametrize("contenido", ["", "documentos: []", "- x", "documentos: [1]"])
def test_rechaza_un_manifiesto_vacio_o_que_no_lista_documentos(
    tmp_path: Path, contenido: str
) -> None:
    with pytest.raises(ManifiestoInvalido):
        leer_manifiesto(escribir(tmp_path, contenido))


def test_un_manifiesto_ilegible_no_filtra_la_ruta(tmp_path: Path) -> None:
    with pytest.raises(ManifiestoInvalido) as error:
        leer_manifiesto(tmp_path / "no-existe.yaml")

    assert str(tmp_path) not in str(error.value)


def test_lee_la_url_original_https_del_documento_y_es_none_cuando_no_se_declara(
    tmp_path: Path,
) -> None:
    con_url = DOCUMENTO_VALIDO + "    original_url: https://pmc.ncbi.nlm.nih.gov/articles/PMC1/\n"

    documento_con = leer_manifiesto(escribir(tmp_path, con_url))[0]
    documento_sin = leer_manifiesto(escribir(tmp_path, DOCUMENTO_VALIDO))[0]

    assert documento_con.url_original == "https://pmc.ncbi.nlm.nih.gov/articles/PMC1/"
    assert documento_sin.url_original is None


@pytest.mark.parametrize(
    "url",
    [
        "http://www.cancer.gov/types/breast",
        "javascript:alert(1)",
        "ftp://servidor.test/doc",
        "no es una url",
        "https://",
    ],
)
def test_rechaza_una_url_original_que_no_es_https_con_host(tmp_path: Path, url: str) -> None:
    contenido = DOCUMENTO_VALIDO + f"    original_url: {url!r}\n"

    with pytest.raises(ManifiestoInvalido, match="d-1: original_url"):
        leer_manifiesto(escribir(tmp_path, contenido))
