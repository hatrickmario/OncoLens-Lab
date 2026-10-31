from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.evaluation.dataset_loader import (
    DatasetInvalido,
    cargar_dataset,
    cargar_dataset_configurado,
)


def _editar(ruta: Path, cambio) -> None:
    contenido = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    cambio(contenido)
    ruta.write_text(yaml.safe_dump(contenido, allow_unicode=True), encoding="utf-8")


@pytest.mark.ac("US-012", 9)
def test_dataset_loader_dataset_real_cumple_tamano_idioma_y_manifiesto_con_ac9(
    dataset_dir: Path,
) -> None:
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

    ct = [f for f in dataset.fuentes if "nct_id" in f.datos]
    assert len(ct) == 4
    assert all(f.datos["licencia_verificada"] == "terminos_NLM_ClinicalTrials_gov" for f in ct)


def test_dataset_loader_clinicaltrials_sin_terminos_verificados_se_rechaza(
    dataset_dir: Path,
) -> None:
    def borrar(m: dict) -> None:
        for f in m["fuentes"]:
            if "nct_id" in f:
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


def test_dataset_loader_cita_de_documento_fuera_del_manifiesto_se_rechaza(
    dataset_dir: Path,
) -> None:
    def romper(g: dict) -> None:
        g["preguntas"][0]["evidencia"][0]["documento"] = "ZZZ"

    _editar(dataset_dir / "golden.yaml", romper)

    with pytest.raises(DatasetInvalido, match="no está en el manifiesto"):
        cargar_dataset(dataset_dir)


def test_dataset_loader_etiqueta_nli_desconocida_se_rechaza(dataset_dir: Path) -> None:
    _editar(
        dataset_dir / "nli-pares.yaml", lambda n: n["pares"][0].__setitem__("etiqueta", "quizas")
    )

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


@pytest.mark.parametrize(
    "licencia", ["cc by-nd 3.0", "CC BY 4.0 con ND", "CC BY-NC 4.0", "CC BY 4.0 y algo más"]
)
def test_dataset_loader_licencia_fuera_de_las_clases_aceptadas_se_rechaza(
    dataset_dir: Path, licencia: str
) -> None:
    _con_licencia(dataset_dir, licencia)

    with pytest.raises(DatasetInvalido, match="licencia"):
        cargar_dataset(dataset_dir)


@pytest.mark.parametrize("licencia", ["CC BY 4.0", "CC BY-SA 4.0", "CC0 1.0", "Dominio público"])
def test_dataset_loader_acepta_clases_de_licencia_permitidas(
    dataset_dir: Path, licencia: str
) -> None:
    _con_licencia(dataset_dir, licencia)

    assert cargar_dataset(dataset_dir).fuentes


def _con_cc_by_nc(dataset_dir: Path, marca: object | None) -> None:
    def poner(m: dict) -> None:
        m["fuentes"][1]["licencia"] = "CC BY-NC 4.0"
        if marca is not None:
            m["fuentes"][1]["nc_solo_academico"] = marca

    _editar(dataset_dir / "manifest.yaml", poner)


def test_dataset_loader_cc_by_nc_se_acepta_con_la_clave_activa_y_la_marca_academica(
    dataset_dir: Path,
) -> None:
    _con_cc_by_nc(dataset_dir, True)

    assert cargar_dataset(dataset_dir, permitir_cc_by_nc=True).fuentes


@pytest.mark.parametrize("marca", [None, False, "true"])
def test_dataset_loader_cc_by_nc_sin_marca_academica_se_rechaza_nombrando_el_id(
    dataset_dir: Path, marca: object | None
) -> None:
    _con_cc_by_nc(dataset_dir, marca)

    with pytest.raises(DatasetInvalido, match=r"M02.*nc_solo_academico"):
        cargar_dataset(dataset_dir, permitir_cc_by_nc=True)


def test_dataset_loader_cc_by_nc_con_marca_pero_clave_desactivada_se_rechaza(
    dataset_dir: Path,
) -> None:
    _con_cc_by_nc(dataset_dir, True)

    with pytest.raises(DatasetInvalido, match=r"M02.*ALLOW_CC_BY_NC"):
        cargar_dataset(dataset_dir)


@pytest.mark.ac("US-012", 9)
def test_dataset_loader_terminos_verificados_no_rescatan_una_licencia_nc(dataset_dir: Path) -> None:
    def poner(m: dict) -> None:
        m["fuentes"][1]["licencia"] = "CC BY-NC 4.0"
        m["fuentes"][1]["licencia_verificada"] = "terminos_NLM_ClinicalTrials_gov"

    _editar(dataset_dir / "manifest.yaml", poner)

    with pytest.raises(DatasetInvalido, match="licencia"):
        cargar_dataset(dataset_dir)


def test_dataset_loader_terminos_verificados_solo_valen_para_clinicaltrials_sin_licencia_declarada(
    dataset_dir: Path,
) -> None:
    def poner(m: dict) -> None:
        for f in m["fuentes"]:
            if "nct_id" in f:
                f["licencia"] = "CC BY-NC-ND 4.0"

    _editar(dataset_dir / "manifest.yaml", poner)

    with pytest.raises(DatasetInvalido, match="licencia"):
        cargar_dataset(dataset_dir)


def test_dataset_loader_texto_de_nci_con_cola_distinta_de_la_aclaracion_se_rechaza(
    dataset_dir: Path,
) -> None:
    _con_licencia(dataset_dir, "Texto de NCI libre de copyright y todos los derechos reservados")

    with pytest.raises(DatasetInvalido, match="licencia"):
        cargar_dataset(dataset_dir)


def _reetiquetar_clinicaltrials_sin_licencia(dataset_dir: Path, fuente: str) -> None:
    def poner(m: dict) -> None:
        for f in m["fuentes"]:
            if "nct_id" in f:
                f["fuente"] = fuente
                f.pop("licencia", None)
                f["licencia_verificada"] = "terminos_NLM_ClinicalTrials_gov"

    _editar(dataset_dir / "manifest.yaml", poner)


@pytest.mark.parametrize(
    "fuente", ["ClinicalTrials.gov / NCT00490139", "ClinicalTrials.gov", "  clinicaltrials.gov  "]
)
def test_dataset_loader_acepta_la_etiqueta_canonica_de_clinicaltrials_con_terminos_verificados(
    dataset_dir: Path, fuente: str
) -> None:
    _reetiquetar_clinicaltrials_sin_licencia(dataset_dir, fuente)

    ids = {f.id for f in cargar_dataset(dataset_dir).fuentes}
    assert {"M09", "M10", "P09", "P10"} <= ids


@pytest.mark.parametrize(
    "fuente",
    [
        "evilclinicaltrials.gov",
        "ClinicalTrials.gov.evil.com / x",
        "https://clinicaltrials.gov/x",
        "otra / ClinicalTrials.gov",
    ],
)
def test_dataset_loader_rechaza_etiquetas_que_imitan_a_clinicaltrials_aunque_traigan_terminos_verificados(
    dataset_dir: Path, fuente: str
) -> None:
    _reetiquetar_clinicaltrials_sin_licencia(dataset_dir, fuente)

    with pytest.raises(DatasetInvalido, match="licencia"):
        cargar_dataset(dataset_dir)


def test_dataset_loader_mini_dataset_real_carga_y_acepta_sus_fuentes_de_clinicaltrials(
    dataset_dir: Path,
) -> None:
    dataset = cargar_dataset(dataset_dir)

    ct = [f for f in dataset.fuentes if "nct_id" in f.datos]
    assert ct


def test_dataset_loader_licencia_nd_se_rechaza_sin_pedir_la_marca_academica(
    dataset_dir: Path,
) -> None:
    _con_licencia(dataset_dir, "CC BY-ND 4.0")

    with pytest.raises(DatasetInvalido, match="M02") as error:
        cargar_dataset(dataset_dir, permitir_cc_by_nc=True)
    assert "nc_solo_academico" not in str(error.value)


def test_dataset_loader_cc_by_nc_sin_marca_con_clave_activa_nombra_la_marca(
    dataset_dir: Path,
) -> None:
    _con_cc_by_nc(dataset_dir, None)

    with pytest.raises(DatasetInvalido, match=r"M02.*nc_solo_academico"):
        cargar_dataset(dataset_dir, permitir_cc_by_nc=True)


def test_dataset_loader_configurado_carga_cc_by_nc_marcada_cuando_la_clave_esta_activa(
    dataset_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _con_cc_by_nc(dataset_dir, True)
    monkeypatch.setenv("ALLOW_CC_BY_NC", "true")

    assert cargar_dataset_configurado(dataset_dir).fuentes


def test_dataset_loader_configurado_rechaza_cc_by_nc_marcada_cuando_la_clave_esta_ausente(
    dataset_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _con_cc_by_nc(dataset_dir, True)
    monkeypatch.delenv("ALLOW_CC_BY_NC", raising=False)

    with pytest.raises(DatasetInvalido, match="M02"):
        cargar_dataset_configurado(dataset_dir)
