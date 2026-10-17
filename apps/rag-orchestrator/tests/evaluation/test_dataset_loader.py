from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

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
            fuente = f["fuente"]
            host = urlparse(fuente if "://" in fuente else f"https://{fuente}").hostname
            if host and (host == "clinicaltrials.gov" or host.endswith(".clinicaltrials.gov")):
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


def _con_licencia(dataset_dir: Path, licencia: str) -> None:
    def poner(m: dict) -> None:
        m["fuentes"][1]["licencia"] = licencia

    _editar(dataset_dir / "manifest.yaml", poner)


@pytest.mark.ac("US-012", 9)
def test_dataset_loader_fuente_cc_by_nd_se_rechaza(dataset_dir: Path) -> None:
    _con_licencia(dataset_dir, "CC BY-ND 4.0")

    with pytest.raises(DatasetInvalido, match="licencia"):
        cargar_dataset(dataset_dir)


@pytest.mark.ac("US-012", 9)
def test_dataset_loader_fuente_cc_by_nc_nd_se_rechaza(dataset_dir: Path) -> None:
    _con_licencia(dataset_dir, "CC BY-NC-ND 4.0")

    with pytest.raises(DatasetInvalido, match="licencia"):
        cargar_dataset(dataset_dir)


@pytest.mark.parametrize("licencia", ["cc by-nd 3.0", "CC BY 4.0 con ND", "CC BY-NC 4.0", "CC BY 4.0 y algo más"])
def test_dataset_loader_licencia_fuera_de_las_clases_aceptadas_se_rechaza(dataset_dir: Path, licencia: str) -> None:
    _con_licencia(dataset_dir, licencia)

    with pytest.raises(DatasetInvalido, match="licencia"):
        cargar_dataset(dataset_dir)


@pytest.mark.parametrize("licencia", ["CC BY 4.0", "CC BY-SA 4.0", "CC0 1.0", "Dominio público"])
def test_dataset_loader_acepta_clases_de_licencia_permitidas(dataset_dir: Path, licencia: str) -> None:
    _con_licencia(dataset_dir, licencia)

    assert cargar_dataset(dataset_dir).fuentes


def test_dataset_loader_cc_by_nc_se_acepta_solo_con_bandera_de_mvp_academico(dataset_dir: Path) -> None:
    _con_licencia(dataset_dir, "CC BY-NC 4.0")

    assert cargar_dataset(dataset_dir, permitir_cc_by_nc=True).fuentes


@pytest.mark.ac("US-012", 9)
def test_dataset_loader_terminos_verificados_no_rescatan_una_licencia_nc(dataset_dir: Path) -> None:
    def poner(m: dict) -> None:
        m["fuentes"][1]["licencia"] = "CC BY-NC 4.0"
        m["fuentes"][1]["licencia_verificada"] = "terminos_NLM_ClinicalTrials_gov"

    _editar(dataset_dir / "manifest.yaml", poner)

    with pytest.raises(DatasetInvalido, match="licencia"):
        cargar_dataset(dataset_dir)


def test_dataset_loader_terminos_verificados_solo_valen_para_clinicaltrials_sin_licencia_declarada(dataset_dir: Path) -> None:
    def poner(m: dict) -> None:
        for f in m["fuentes"]:
            fuente = f["fuente"]
            host = urlparse(fuente).hostname
            if host is None:
                host = urlparse(f"https://{fuente}").hostname
            if host and host.lower() == "clinicaltrials.gov":
                f["licencia"] = "CC BY-NC-ND 4.0"

    _editar(dataset_dir / "manifest.yaml", poner)

    with pytest.raises(DatasetInvalido, match="licencia"):
        cargar_dataset(dataset_dir)


def test_dataset_loader_texto_de_nci_con_cola_distinta_de_la_aclaracion_se_rechaza(dataset_dir: Path) -> None:
    _con_licencia(dataset_dir, "Texto de NCI libre de copyright y todos los derechos reservados")

    with pytest.raises(DatasetInvalido, match="licencia"):
        cargar_dataset(dataset_dir)
