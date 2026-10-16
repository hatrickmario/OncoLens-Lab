from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from app.evaluation.dataset_loader import DatasetInvalido, cargar_dataset


def _editar(ruta: Path, cambio) -> None:
    contenido = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    cambio(contenido)
    ruta.write_text(yaml.safe_dump(contenido, allow_unicode=True), encoding="utf-8")


@pytest.mark.ac("US-012", 9)
def test_dataset_loader_dataset_real_cumple_tamano_idioma_y_manifiesto_con_ac9(dataset_dir: Path) -> None:
    dataset = cargar_dataset(dataset_dir)

    assert len(dataset.preguntas) >= 30
    assert sum(1 for p in dataset.preguntas if p.es_espanol_contra_ingles) >= 10
    assert len(dataset.pares_nli) >= 30
    assert all(p.evidencia for p in dataset.preguntas if p.modo_acierto != "sin_evidencia")


@pytest.mark.ac("US-012", 9)
def test_dataset_loader_manifiesto_sin_clase_sintetica_se_rechaza_ac9(dataset_dir: Path) -> None:
    _editar(dataset_dir / "manifest.yaml", lambda m: m.pop("clase"))

    with pytest.raises(DatasetInvalido, match="clase: sintetico"):
        cargar_dataset(dataset_dir)


@pytest.mark.ac("US-012", 9)
def test_dataset_loader_fuente_sin_licencia_se_rechaza_ac9(dataset_dir: Path) -> None:
    def quitar(m: dict) -> None:
        m["fuentes"][1].pop("licencia", None)

    _editar(dataset_dir / "manifest.yaml", quitar)

    with pytest.raises(DatasetInvalido, match="licencia"):
        cargar_dataset(dataset_dir)


def test_dataset_loader_fuente_excluida_nccn_se_rechaza(dataset_dir: Path) -> None:
    def agregar(m: dict) -> None:
        m["fuentes"].append({"id": "X01", "fuente": "NCCN", "licencia": "CC BY 4.0"})

    _editar(dataset_dir / "manifest.yaml", agregar)

    with pytest.raises(DatasetInvalido, match="excluida"):
        cargar_dataset(dataset_dir)


def test_dataset_loader_acepta_clinicaltrials_por_terminos_verificados(dataset_dir: Path) -> None:
    dataset = cargar_dataset(dataset_dir)

    ct = [f for f in dataset.fuentes if f.nombre.startswith("ClinicalTrials.gov")]
    assert ct and all(f.datos["licencia_verificada"] == "terminos_NLM_ClinicalTrials_gov" for f in ct)


def test_dataset_loader_clinicaltrials_sin_terminos_verificados_se_rechaza(dataset_dir: Path) -> None:
    def borrar(m: dict) -> None:
        for f in m["fuentes"]:
            if f["fuente"].startswith("ClinicalTrials.gov"):
                f.pop("licencia_verificada")

    _editar(dataset_dir / "manifest.yaml", borrar)

    with pytest.raises(DatasetInvalido, match="licencia"):
        cargar_dataset(dataset_dir)


def test_dataset_loader_pocas_preguntas_en_espanol_se_rechaza(dataset_dir: Path) -> None:
    def pasar_a_ingles(g: dict) -> None:
        for p in g["preguntas"]:
            p["idioma"] = "en"

    _editar(dataset_dir / "golden.yaml", pasar_a_ingles)

    with pytest.raises(DatasetInvalido, match="es → en"):
        cargar_dataset(dataset_dir)


def test_dataset_loader_menos_de_30_pares_nli_se_rechaza(dataset_dir: Path) -> None:
    _editar(dataset_dir / "nli-pares.yaml", lambda n: n.__setitem__("pares", n["pares"][:10]))

    with pytest.raises(DatasetInvalido, match="pares NLI"):
        cargar_dataset(dataset_dir)


def test_dataset_loader_cita_de_documento_fuera_del_manifiesto_se_rechaza(dataset_dir: Path) -> None:
    def romper(g: dict) -> None:
        g["preguntas"][0]["evidencia"][0]["documento"] = "ZZZ"

    _editar(dataset_dir / "golden.yaml", romper)

    with pytest.raises(DatasetInvalido, match="no está en el manifiesto"):
        cargar_dataset(dataset_dir)


def test_dataset_loader_etiqueta_nli_desconocida_se_rechaza(dataset_dir: Path) -> None:
    _editar(dataset_dir / "nli-pares.yaml", lambda n: n["pares"][0].__setitem__("etiqueta", "quizas"))

    with pytest.raises(DatasetInvalido, match="etiqueta NLI"):
        cargar_dataset(dataset_dir)


def test_dataset_loader_golden_sin_clase_sintetica_se_rechaza(dataset_dir: Path) -> None:
    _editar(dataset_dir / "golden.yaml", lambda g: g.pop("clase"))

    with pytest.raises(DatasetInvalido, match="golden"):
        cargar_dataset(dataset_dir)
