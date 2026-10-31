from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest
import respx
from datos_sinteticos import CTGOV, JATS, NCI, mock_fuentes, preparar_dataset

from app.evaluation.dataset_loader import cargar_dataset
from app.evaluation.parsers_fuentes import parsear_html_nci, parsear_jats, parsear_registro_ctgov
from app.scripts import adr39_fetch_sources as fetch


def test_parsear_jats_separa_titulo_resumen_y_secciones_aplanando_subsecciones_y_separando_subindices() -> (
    None
):
    secciones = parsear_jats(JATS)

    assert [s.nombre for s in secciones] == ["Título", "Resumen", "Metodos", "Resultados"]
    assert "P interaction = 0.028" in secciones[2].texto and "SET ER/PR" in secciones[2].texto
    assert "Texto anidado." in secciones[3].texto


def test_parsear_registro_ctgov_genera_un_campo_por_modulo() -> None:
    secciones = parsear_registro_ctgov(CTGOV)

    assert {s.nombre for s in secciones} == {
        "protocolo:identification",
        "protocolo:eligibility",
        "resultados:outcomeMeasures",
    }


def test_parsear_html_nci_corta_por_encabezados_sin_navegacion_y_conserva_pies_de_figura() -> None:
    secciones = {s.nombre: s.texto for s in parsear_html_nci(NCI)}

    assert set(secciones) == {"Pagina", "Seccion A"}
    assert (
        "MENU" not in str(secciones)
        and "NAVEGACION" not in str(secciones)
        and "PIE" not in str(secciones)
    )
    assert "Pie de figura sintetico." in secciones["Seccion A"]


AHORA = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)


@pytest.mark.ac("US-012", 13)
@respx.mock(assert_all_called=False)
def test_descargar_fuentes_registra_sha256_y_verifica_citas_presentes_ac13(
    respx_mock: respx.MockRouter, tmp_path: Path
) -> None:
    mock_fuentes(respx_mock)
    dataset = cargar_dataset(preparar_dataset(tmp_path))

    with httpx.Client() as cliente:
        fuentes = fetch.descargar_fuentes(
            dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=lambda _s: None
        )

    registro = json.loads((tmp_path / "cache" / "adr39" / "descargas.json").read_text())
    assert registro["A1"]["sha256"] == hashlib.sha256(JATS).hexdigest()
    assert registro["A1"]["descargado"] == "2026-10-15T12:00:00+00:00"
    assert fetch.verificar_citas(dataset, fuentes) == []


@pytest.mark.ac("US-012", 13)
@respx.mock(assert_all_called=False)
def test_main_termina_con_codigo_1_e_indica_documento_y_pregunta_si_una_cita_no_aparece_ac13(
    respx_mock: respx.MockRouter, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    mock_fuentes(respx_mock)
    ruta = preparar_dataset(tmp_path, cita_ctgov="Frase que no existe en el registro")

    codigo = fetch.main(
        ["--dataset-dir", str(ruta), "--cache-dir", str(tmp_path / "cache")], cliente=httpx.Client()
    )

    assert codigo == 1
    assert "pregunta QCT en el documento C1" in capsys.readouterr().err


@respx.mock(assert_all_called=False)
def test_descargar_fuentes_reutiliza_la_cache_sin_volver_a_descargar(
    respx_mock: respx.MockRouter, tmp_path: Path
) -> None:
    mock_fuentes(respx_mock)
    dataset = cargar_dataset(preparar_dataset(tmp_path))
    with httpx.Client() as cliente:
        fetch.descargar_fuentes(
            dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=lambda _s: None
        )
        llamadas = respx_mock.calls.call_count
        fetch.descargar_fuentes(
            dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=lambda _s: None
        )

    assert respx_mock.calls.call_count == llamadas == 3


@respx.mock(assert_all_called=False)
def test_descargar_fuentes_detecta_una_cache_alterada_respecto_al_sha256_registrado(
    respx_mock: respx.MockRouter, tmp_path: Path
) -> None:
    mock_fuentes(respx_mock)
    dataset = cargar_dataset(preparar_dataset(tmp_path))
    with httpx.Client() as cliente:
        fetch.descargar_fuentes(
            dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=lambda _s: None
        )
        (tmp_path / "cache" / "adr39" / "A1.xml").write_bytes(b"<article/>")

        with pytest.raises(fetch.FuenteNoDescargable, match="SHA-256"):
            fetch.descargar_fuentes(
                dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=lambda _s: None
            )


@respx.mock(assert_all_called=False)
def test_descargar_fuentes_falla_tras_reintentar_si_el_origen_responde_error(
    respx_mock: respx.MockRouter, tmp_path: Path
) -> None:
    respx_mock.get("https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1/fullTextXML").respond(503)
    dataset = cargar_dataset(preparar_dataset(tmp_path))
    esperas: list[float] = []

    with httpx.Client() as cliente, pytest.raises(fetch.FuenteNoDescargable):
        fetch.descargar_fuentes(
            dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=esperas.append
        )

    assert len(esperas) == fetch.INTENTOS


@respx.mock(assert_all_called=False)
def test_leer_fuentes_de_cache_detecta_una_cache_alterada_respecto_al_sha256_registrado(
    respx_mock: respx.MockRouter, tmp_path: Path
) -> None:
    mock_fuentes(respx_mock)
    dataset = cargar_dataset(preparar_dataset(tmp_path))
    with httpx.Client() as cliente:
        fetch.descargar_fuentes(
            dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=lambda _s: None
        )
    (tmp_path / "cache" / "adr39" / "A1.xml").write_bytes(b"<article/>")

    with pytest.raises(fetch.FuenteNoDescargable, match="SHA-256"):
        fetch.leer_fuentes_de_cache(dataset, tmp_path / "cache")


@respx.mock(assert_all_called=False)
def test_leer_fuentes_de_cache_devuelve_las_mismas_fuentes_que_la_descarga(
    respx_mock: respx.MockRouter, tmp_path: Path
) -> None:
    mock_fuentes(respx_mock)
    dataset = cargar_dataset(preparar_dataset(tmp_path))
    with httpx.Client() as cliente:
        descargadas = fetch.descargar_fuentes(
            dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=lambda _s: None
        )

    assert fetch.leer_fuentes_de_cache(dataset, tmp_path / "cache") == descargadas


def test_url_de_con_formato_desconocido_lanza_un_error_que_nombra_el_formato() -> None:
    from app.evaluation.dataset_loader import Fuente

    fuente = Fuente(id="X1", nombre="x", tipo="t", formato_original="pdf", datos={})

    with pytest.raises(fetch.FormatoNoSoportado, match="pdf"):
        fetch.url_de(fuente)


def test_url_de_construye_la_url_segun_el_formato_de_la_fuente(tmp_path: Path) -> None:
    dataset = cargar_dataset(preparar_dataset(tmp_path))

    urls = {f.id: fetch.url_de(f) for f in dataset.fuentes}

    assert urls["A1"].endswith("/PMC1/fullTextXML")
    assert urls["C1"].endswith("/NCT00000000")
    assert urls["N1"] == "https://www.cancer.gov/types/breast/stages"


def test_main_de_fetch_rechaza_cc_by_nc_marcada_cuando_la_clave_esta_ausente(
    dataset_dir: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    import yaml

    ruta = dataset_dir / "manifest.yaml"
    manifiesto = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    manifiesto["fuentes"][1].update({"licencia": "CC BY-NC 4.0", "nc_solo_academico": True})
    ruta.write_text(yaml.safe_dump(manifiesto, allow_unicode=True), encoding="utf-8")
    monkeypatch.delenv("ALLOW_CC_BY_NC", raising=False)

    codigo = fetch.main(
        ["--dataset-dir", str(dataset_dir), "--cache-dir", str(tmp_path / "cache")],
        cliente=httpx.Client(),
    )

    assert codigo == 2
    assert "M02" in capsys.readouterr().err
