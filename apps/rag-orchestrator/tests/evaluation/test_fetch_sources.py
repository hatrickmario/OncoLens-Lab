from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest
import respx
import yaml
from app.evaluation.dataset_loader import cargar_dataset
from app.evaluation.parsers_fuentes import parsear_html_nci, parsear_jats, parsear_registro_ctgov
from app.scripts import adr39_fetch_sources as fetch

JATS = (
    b"<article><front><article-meta><title-group><article-title>Titulo de prueba</article-title></title-group>"
    b"<abstract><p>Resumen sintetico.</p></abstract></article-meta></front>"
    b"<body><sec><title>Metodos</title><p>Valor de P<sub>interaction</sub> = 0.028 en SET<sub>ER/PR</sub>.</p></sec>"
    b"<sec><title>Resultados</title><sec><title>Sub</title><p>Texto anidado.</p></sec></sec></body></article>"
)
CTGOV = json.dumps(
    {
        "protocolSection": {
            "identificationModule": {"nctId": "NCT00000000", "briefTitle": "Titulo sintetico"},
            "eligibilityModule": {"eligibilityCriteria": "Criterios sinteticos"},
        },
        "resultsSection": {"outcomeMeasuresModule": {"outcomeMeasures": [{"title": "Disease-Free Survival"}]}},
    }
).encode()
NCI = (
    b"<html><body><header>MENU</header><main id='main-content'><h1>Pagina</h1><p>Intro sintetica.</p>"
    b"<h2>Seccion A</h2><p>Texto A.</p><figure><figcaption>Pie de figura sintetico.</figcaption></figure>"
    b"<nav>NAVEGACION</nav></main><footer>PIE</footer></body></html>"
)


def test_parsear_jats_separa_titulo_resumen_y_secciones_aplanando_subsecciones_y_separando_subindices() -> None:
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
    assert "MENU" not in str(secciones) and "NAVEGACION" not in str(secciones) and "PIE" not in str(secciones)
    assert "Pie de figura sintetico." in secciones["Seccion A"]


def _preparar_dataset(tmp_path: Path, cita_ctgov: str = "Disease-Free Survival") -> Path:
    destino = tmp_path / "ds"
    destino.mkdir()
    fuentes = [
        {"id": "A1", "fuente": "PMC Open Access", "tipo": "x", "formato_original": "jats_xml", "licencia": "CC BY 4.0", "pmcid": "PMC1"},
        {
            "id": "C1",
            "fuente": "ClinicalTrials.gov / NCT00000000",
            "tipo": "x",
            "formato_original": "json_api",
            "nct_id": "NCT00000000",
            "licencia_verificada": "terminos_NLM_ClinicalTrials_gov",
        },
        {
            "id": "N1",
            "fuente": "NCI",
            "tipo": "x",
            "formato_original": "html",
            "licencia": "Texto de NCI libre de copyright (https://www.cancer.gov/policies/copyright-reuse)",
            "url": "https://www.cancer.gov/types/breast/stages",
        },
    ]
    preguntas = []
    for i in range(30):
        preguntas.append(
            {
                "id": f"Q{i}",
                "idioma": "es",
                "cancer": "mama",
                "tipo": "hecho",
                "pregunta": "¿?",
                "documentos": ["A1"],
                "evidencia": [{"documento": "A1", "cita": "Valor de P interaction = 0.028"}],
                "modo_acierto": "cualquiera",
            }
        )
    preguntas.append(
        {
            "id": "QCT",
            "idioma": "es",
            "cancer": "mama",
            "tipo": "hecho",
            "pregunta": "¿?",
            "documentos": ["C1", "N1"],
            "evidencia": [{"documento": "C1", "cita": cita_ctgov}, {"documento": "N1", "cita": "Texto A"}],
            "modo_acierto": "cobertura_documentos",
        }
    )
    pares = [
        {
            "id": f"N{i}",
            "etiqueta": "neutral",
            "fragmento": "f",
            "afirmacion": "a",
            "idioma_afirmacion": "es",
            "idioma_fragmento": "en",
        }
        for i in range(30)
    ]
    (destino / "manifest.yaml").write_text(
        yaml.safe_dump({"clase": "sintetico", "nombre": "t", "version": "0", "archivos": {"golden": "g.yaml", "nli": "n.yaml"}, "fuentes": fuentes})
    )
    (destino / "g.yaml").write_text(yaml.safe_dump({"clase": "sintetico", "preguntas": preguntas}))
    (destino / "n.yaml").write_text(yaml.safe_dump({"clase": "sintetico", "pares": pares}))
    return destino


def _mock_fuentes(router: respx.MockRouter) -> None:
    router.get("https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1/fullTextXML").respond(200, content=JATS)
    router.get("https://clinicaltrials.gov/api/v2/studies/NCT00000000").respond(200, content=CTGOV)
    router.get("https://www.cancer.gov/types/breast/stages").respond(200, content=NCI)


AHORA = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)


@pytest.mark.ac("US-012", 13)
@respx.mock(assert_all_called=False)
def test_descargar_fuentes_registra_sha256_y_verifica_citas_presentes_ac13(respx_mock: respx.MockRouter, tmp_path: Path) -> None:
    _mock_fuentes(respx_mock)
    dataset = cargar_dataset(_preparar_dataset(tmp_path))

    with httpx.Client() as cliente:
        fuentes = fetch.descargar_fuentes(dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=lambda _s: None)

    registro = json.loads((tmp_path / "cache" / "adr39" / "descargas.json").read_text())
    assert registro["A1"]["sha256"] == hashlib.sha256(JATS).hexdigest()
    assert registro["A1"]["descargado"] == "2026-10-15T12:00:00+00:00"
    assert fetch.verificar_citas(dataset, fuentes) == []


@pytest.mark.ac("US-012", 13)
@respx.mock(assert_all_called=False)
def test_main_termina_con_codigo_1_e_indica_documento_y_pregunta_si_una_cita_no_aparece_ac13(
    respx_mock: respx.MockRouter, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _mock_fuentes(respx_mock)
    ruta = _preparar_dataset(tmp_path, cita_ctgov="Frase que no existe en el registro")

    codigo = fetch.main(["--dataset-dir", str(ruta), "--cache-dir", str(tmp_path / "cache")], cliente=httpx.Client())

    assert codigo == 1
    assert "pregunta QCT en el documento C1" in capsys.readouterr().err


@respx.mock(assert_all_called=False)
def test_descargar_fuentes_reutiliza_la_cache_sin_volver_a_descargar(respx_mock: respx.MockRouter, tmp_path: Path) -> None:
    _mock_fuentes(respx_mock)
    dataset = cargar_dataset(_preparar_dataset(tmp_path))
    with httpx.Client() as cliente:
        fetch.descargar_fuentes(dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=lambda _s: None)
        llamadas = respx_mock.calls.call_count
        fetch.descargar_fuentes(dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=lambda _s: None)

    assert respx_mock.calls.call_count == llamadas == 3


@respx.mock(assert_all_called=False)
def test_descargar_fuentes_detecta_una_cache_alterada_respecto_al_sha256_registrado(
    respx_mock: respx.MockRouter, tmp_path: Path
) -> None:
    _mock_fuentes(respx_mock)
    dataset = cargar_dataset(_preparar_dataset(tmp_path))
    with httpx.Client() as cliente:
        fetch.descargar_fuentes(dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=lambda _s: None)
        (tmp_path / "cache" / "adr39" / "A1.xml").write_bytes(b"<article/>")

        with pytest.raises(fetch.FuenteNoDescargable, match="SHA-256"):
            fetch.descargar_fuentes(dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=lambda _s: None)


@respx.mock(assert_all_called=False)
def test_descargar_fuentes_falla_tras_reintentar_si_el_origen_responde_error(respx_mock: respx.MockRouter, tmp_path: Path) -> None:
    respx_mock.get("https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1/fullTextXML").respond(503)
    dataset = cargar_dataset(_preparar_dataset(tmp_path))
    esperas: list[float] = []

    with httpx.Client() as cliente, pytest.raises(fetch.FuenteNoDescargable):
        fetch.descargar_fuentes(dataset, tmp_path / "cache", cliente, lambda: AHORA, dormir=esperas.append)

    assert len(esperas) == fetch.INTENTOS


def test_url_de_construye_la_url_segun_el_formato_de_la_fuente(tmp_path: Path) -> None:
    dataset = cargar_dataset(_preparar_dataset(tmp_path))

    urls = {f.id: fetch.url_de(f) for f in dataset.fuentes}

    assert urls["A1"].endswith("/PMC1/fullTextXML")
    assert urls["C1"].endswith("/NCT00000000")
    assert urls["N1"] == "https://www.cancer.gov/types/breast/stages"
