"""Humo del dataset sintetico ``data/eval/pii-mini`` (US-013 AC-1, RN-13, RN-14)."""

from __future__ import annotations

import json
import re

import pytest

from app.scripts.adr40.dataset import CONTEXTO_DE_DOCUMENTO, DatasetInvalido, cargar_corpus
from tests.evaluation.conftest import RAIZ_REPO

PII_MINI = RAIZ_REPO / "data" / "eval" / "pii-mini"
TIPOS_DIRECTOS = {"nombre", "documento", "telefono", "correo", "direccion", "fecha_nacimiento"}


def _manifiesto() -> dict:  # type: ignore[type-arg]
    return json.loads((PII_MINI / "manifest.json").read_text(encoding="utf-8"))


@pytest.mark.ac("US-013", 1)
def test_pii_mini_declara_clase_sintetico_y_coincide_con_el_corpus_materializado() -> None:
    manifiesto = _manifiesto()

    corpus = cargar_corpus()

    assert manifiesto["clase"] == "sintetico" and manifiesto["valores_en_el_repo"] is False
    assert len(corpus) == manifiesto["textos"] == 300
    assert {t.contexto for t in corpus} == set(manifiesto["contextos"])


def test_cada_texto_tiene_etiquetas_que_apuntan_a_su_propio_contenido() -> None:
    for texto in cargar_corpus():
        assert texto.etiquetas or texto.contexto == "pregunta"
        for etiqueta in texto.etiquetas:
            assert 0 <= etiqueta.inicio < etiqueta.fin <= len(texto.texto)
            assert texto.texto[etiqueta.inicio : etiqueta.fin].strip() != ""


def test_el_corpus_cubre_los_seis_tipos_directos_y_al_menos_tres_paises() -> None:
    corpus = cargar_corpus()

    tipos = {e.tipo for t in corpus for e in t.etiquetas}
    paises = _manifiesto()["paises"]

    assert tipos == TIPOS_DIRECTOS
    assert len(paises) >= 3
    assert any(t.contexto == CONTEXTO_DE_DOCUMENTO and len(t.etiquetas) >= 6 for t in corpus)


def test_el_corpus_trae_terminos_clinicos_de_control_con_los_criticos_marcados() -> None:
    controles = [c for t in cargar_corpus() for c in t.controles]

    assert {"HER2", "Gleason 7", "PSA"} <= {c.termino for c in controles}
    assert any(c.critico for c in controles) and any(not c.critico for c in controles)


def test_los_valores_sembrados_son_deterministas_entre_corridas() -> None:
    primera = [(t.id, t.texto) for t in cargar_corpus()]
    segunda = [(t.id, t.texto) for t in cargar_corpus()]

    assert primera == segunda


def test_los_archivos_versionados_del_dataset_no_contienen_valores_de_pii() -> None:
    contenido = "".join(
        p.read_text(encoding="utf-8") for p in PII_MINI.iterdir() if p.suffix in {".json", ".py"}
    )
    valores = [t.texto[e.inicio : e.fin] for t in cargar_corpus() for e in t.etiquetas]

    assert not any(v in contenido for v in valores if re.search(r"\d", v))


def test_rechaza_un_manifiesto_con_huella_distinta(tmp_path) -> None:  # type: ignore[no-untyped-def]
    copia = tmp_path / "data" / "eval" / "pii-mini"
    copia.mkdir(parents=True)
    for archivo in PII_MINI.iterdir():
        if archivo.is_file():
            (copia / archivo.name).write_bytes(archivo.read_bytes())
    manifiesto = _manifiesto()
    manifiesto["sha256_corpus"] = "0" * 64
    (copia / "manifest.json").write_text(json.dumps(manifiesto), encoding="utf-8")

    with pytest.raises(DatasetInvalido):
        cargar_corpus(tmp_path)
