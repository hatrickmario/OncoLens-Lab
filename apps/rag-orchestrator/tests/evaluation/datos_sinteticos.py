"""Datos sintéticos compartidos por las pruebas de descarga, métricas y medición (sin red ni datos reales)."""

from __future__ import annotations

import json
from pathlib import Path

import respx
import yaml

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


def preparar_dataset(tmp_path: Path, cita_ctgov: str = "Disease-Free Survival") -> Path:
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
                "pregunta": "valor de P interaction en SET",
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
            "pregunta": "Disease-Free Survival y texto A",
            "documentos": ["C1", "N1"],
            "evidencia": [{"documento": "C1", "cita": cita_ctgov}, {"documento": "N1", "cita": "Texto A"}],
            "modo_acierto": "cobertura_documentos",
        }
    )
    preguntas.append(
        {
            "id": "QNA",
            "idioma": "es",
            "cancer": "mama",
            "tipo": "sin_respuesta",
            "pregunta": "tema inexistente en el corpus",
            "documentos": [],
            "evidencia": [],
            "modo_acierto": "sin_evidencia",
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


def mock_fuentes(router: respx.MockRouter) -> None:
    router.get("https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1/fullTextXML").respond(200, content=JATS)
    router.get("https://clinicaltrials.gov/api/v2/studies/NCT00000000").respond(200, content=CTGOV)
    router.get("https://www.cancer.gov/types/breast/stages").respond(200, content=NCI)
