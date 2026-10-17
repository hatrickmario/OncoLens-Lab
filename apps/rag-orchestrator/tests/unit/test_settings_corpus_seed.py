"""Configuración del cargador de la semilla (US-059, RN-22): claves obligatorias y errores sin valores."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config.settings import CorpusSeedSettings

CLAVES = {
    "CORPUS_SEED_MANIFEST_PATH": "/data/seed/manifest.yaml",
    "CORPUS_ACCEPTED_LICENSES": "dominio_publico,cc_by,cc_by_sa",
    "CORPUS_EXCLUDED_SOURCES": "NCCN,ESMO",
    "CORPUS_CUTOFF_DATE": "2026-10-15",
    "CORPUS_CHUNK_SIZE": "1024",
    "CORPUS_CHUNK_OVERLAP": "0",
}


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch: pytest.MonkeyPatch) -> None:
    for clave in (
        *CLAVES,
        "CORPUS_CHUNKING_STRATEGY",
        "CORPUS_LICENSE_CLASS_MAP",
        "CORPUS_FETCH_ALLOWED_HOSTS",
    ):
        monkeypatch.delenv(clave, raising=False)


def con_entorno(monkeypatch: pytest.MonkeyPatch, **cambios: str) -> CorpusSeedSettings:
    for clave, valor in {**CLAVES, **cambios}.items():
        monkeypatch.setenv(clave, valor)
    return CorpusSeedSettings(_env_file=None)  # type: ignore[call-arg]


def test_lee_las_claves_del_entorno_y_separa_las_listas_por_comas(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ajustes = con_entorno(
        monkeypatch, CORPUS_FETCH_ALLOWED_HOSTS="www.cancer.gov, pmc.ncbi.nlm.nih.gov"
    )

    assert ajustes.corpus_seed_manifest_path == Path("/data/seed/manifest.yaml")
    assert ajustes.corpus_accepted_licenses == ("dominio_publico", "cc_by", "cc_by_sa")
    assert ajustes.corpus_excluded_sources == ("NCCN", "ESMO")
    assert ajustes.corpus_cutoff_date == date(2026, 10, 15)
    assert (ajustes.corpus_chunk_size, ajustes.corpus_chunk_overlap) == (1024, 0)
    assert ajustes.corpus_fetch_allowed_hosts == ("www.cancer.gov", "pmc.ncbi.nlm.nih.gov")


def test_sin_hosts_permitidos_el_cargador_no_descarga_nada(monkeypatch: pytest.MonkeyPatch) -> None:
    assert con_entorno(monkeypatch).corpus_fetch_allowed_hosts == ()


def test_el_mapa_de_licencias_por_defecto_asimila_cc0_y_el_texto_de_nci_a_dominio_publico(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mapa = con_entorno(monkeypatch).corpus_license_class_map

    assert mapa["cc0 1.0"] == "dominio_publico"
    assert mapa["texto de nci libre de copyright"] == "dominio_publico"
    assert (mapa["cc by"], mapa["cc by 4.0"], mapa["cc by-sa"]) == ("cc_by", "cc_by", "cc_by_sa")
    assert not any("-nd" in clave for clave in mapa)


@pytest.mark.parametrize("clave", sorted(CLAVES))
def test_sin_una_clave_obligatoria_falla_nombrandola(
    monkeypatch: pytest.MonkeyPatch, clave: str
) -> None:
    for nombre, valor in CLAVES.items():
        if nombre != clave:
            monkeypatch.setenv(nombre, valor)

    with pytest.raises(ValidationError) as error:
        CorpusSeedSettings(_env_file=None)  # type: ignore[call-arg]

    assert clave.lower() in str(error.value)


@pytest.mark.parametrize(
    ("clave", "valor"),
    [
        ("CORPUS_ACCEPTED_LICENSES", "dominio_publico,cc_by_nd"),
        ("CORPUS_ACCEPTED_LICENSES", ""),
        ("CORPUS_CHUNK_SIZE", "0"),
        ("CORPUS_CHUNK_OVERLAP", "-1"),
        ("CORPUS_CHUNKING_STRATEGY", "estructura"),
        ("CORPUS_LICENSE_CLASS_MAP", '{"cc by-nd 4.0": "cc_by_nd"}'),
    ],
)
def test_un_valor_invalido_falla_sin_mostrar_el_valor(
    monkeypatch: pytest.MonkeyPatch, clave: str, valor: str
) -> None:
    with pytest.raises(ValidationError) as error:
        con_entorno(monkeypatch, **{clave: valor})

    assert clave.lower() in str(error.value)
    assert "cc_by_nd" not in str(error.value)


def test_un_solapamiento_igual_al_tamano_falla_nombrando_las_dos_claves(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(ValidationError) as error:
        con_entorno(monkeypatch, CORPUS_CHUNK_SIZE="10", CORPUS_CHUNK_OVERLAP="10")

    assert "CORPUS_CHUNK_OVERLAP" in str(error.value) and "CORPUS_CHUNK_SIZE" in str(error.value)
