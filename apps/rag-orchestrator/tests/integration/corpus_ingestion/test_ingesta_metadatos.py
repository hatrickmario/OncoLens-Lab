"""Metadatos de la ingesta (US-118, L1D-117): aceptación de AC-1…AC-4 y AC-6 sobre FX-06c-b ampliada.

Integración: el ``IngestionPipelineService`` real con el ``MetadataExtractionService`` real; se fingen solo los bordes
(LLM de metadatos, NLI, embeddings). Reloj e ids congelados.
"""

from __future__ import annotations

import json
import random
from dataclasses import replace
from pathlib import Path

import pytest
import yaml

from app.application.corpus_metadata.muestra_de_metadatos import GeneradorDeMuestraDeMetadatos
from app.application.ports import FalloDeInferencia
from app.domain.corpus_metadata.muestra import seleccionar_muestra
from app.domain.corpus_seed.poblacion import CRITERIOS_DE_POBLACION
from app.infrastructure.corpus_metadata.escritor_muestra import EscritorDeMuestraYaml
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.fakes import RelojFijo
from tests.support.metadatos import (
    ENDPOINT_INVENTADO,
    MARCADOR_I_CT_1,
    MARCADOR_I_LIT_1,
    MARCADOR_I_LIT_2,
    lote_sintetico,
)


def _registro(montaje: Montaje, clave: str):
    return next(r for i, r in montaje.catalogo.documentos.items() if i.split("@")[0] == clave)


@pytest.mark.ac("US-118", 1)
def test_ingesta_fuente_estructurada_copia_criterios_sin_invocar_llm(montaje: Montaje) -> None:
    """[US-118 AC-1] Un ensayo con criterios de elegibilidad estructurados no invoca al LLM de metadatos."""
    reporte = montaje.ingerir()

    ensayo = _registro(montaje, "i-ct-1")
    assert ensayo.population_criteria["subtipo"] == "castracion_resistente"
    assert ensayo.population_criteria["estadio"] == "metastasico"
    assert ensayo.population_criteria["ecog"] == "0-1"
    assert ensayo.metadata_source == "fuente_estructurada"
    assert reporte.resultado_de("i-ct-1").metadata_source == "fuente_estructurada"
    assert montaje.llm_metadatos.invocaciones_de(MARCADOR_I_CT_1) == 0


@pytest.mark.ac("US-118", 2)
def test_ingesta_ilit1_metadatos_extraidos_y_verificados(montaje: Montaje) -> None:
    """[US-118 AC-2] Los metadatos de un ensayo descrito solo en texto se extraen y verifican."""
    montaje.ingerir()

    articulo = _registro(montaje, "i-lit-1")
    assert articulo.study_design == "eca"
    assert articulo.trial_phase == "III"
    assert articulo.sample_size == 500
    assert articulo.population_criteria["estadio"] == "I–III"
    assert articulo.population_criteria["biomarcadores"] == {"her2": "positivo"}
    assert articulo.metadata_source == "extraido_verificado"
    assert montaje.llm_metadatos.invocaciones_de(MARCADOR_I_LIT_1) == 1


@pytest.mark.ac("US-118", 3)
def test_ingesta_ilit1_endpoint_inventado_queda_null_y_resto_se_conserva(
    montaje: Montaje,
) -> None:
    """[US-118 AC-3] Un metadato que no pasa el NLI queda no disponible y los demás se conservan."""
    montaje.ingerir()

    articulo = _registro(montaje, "i-lit-1")
    assert articulo.primary_endpoint is None
    assert ENDPOINT_INVENTADO not in str(articulo)
    assert all(ENDPOINT_INVENTADO not in c.chunk_text for c in montaje.almacen.chunks.values())
    assert (articulo.study_design, articulo.trial_phase, articulo.sample_size) == (
        "eca",
        "III",
        500,
    )
    assert articulo.population_criteria["estadio"] == "I–III"


@pytest.mark.ac("US-118", 4)
def test_ingesta_ilit2_sin_poblacion_queda_no_disponible(montaje: Montaje) -> None:
    """[US-118 AC-4] Un documento sin datos de población en el texto deja cada criterio no disponible."""
    montaje.ingerir()

    articulo = _registro(montaje, "i-lit-2")
    assert {articulo.population_criteria[c] for c in CRITERIOS_DE_POBLACION} == {"no_disponible"}
    assert montaje.llm_metadatos.invocaciones_de(MARCADOR_I_LIT_2) == 1
    assert articulo.metadata_source == "extraido_verificado"


def _ingerir_ilit1_con_el_llm_caido_o_roto(montaje: Montaje, modo: str):
    montaje.llm_metadatos.modo = modo
    return montaje.ingerir()


def _afirmar_pendiente_y_embebido(montaje: Montaje, reporte) -> None:
    articulo = _registro(montaje, "i-lit-1")
    assert (articulo.status, articulo.is_current) == ("embebido", True)
    assert articulo.metadata_source == "pendiente"
    assert {articulo.population_criteria[c] for c in CRITERIOS_DE_POBLACION} == {"no_disponible"}
    assert montaje.chunks_por_clave()["i-lit-1"] > 0
    assert "i-lit-1" in {r.document_key for r in reporte.metadatos_pendientes}
    assert reporte.resultado_de("i-lit-1").estado.value == "embebido"


@pytest.mark.ac("US-118", 6)
def test_ingesta_llm_caido_documento_embebido_y_metadatos_pendientes(montaje: Montaje) -> None:
    """[US-118 AC-6] Con el LLM de metadatos caído el documento queda embebido y cuenta como metadatos pendientes."""
    reporte = _ingerir_ilit1_con_el_llm_caido_o_roto(montaje, "error")

    _afirmar_pendiente_y_embebido(montaje, reporte)
    salida = json.dumps(reporte.como_diccionario(), ensure_ascii=False)
    assert "Synthetic review" not in salida and "llm falso" not in salida
    assert "FalloDelLlm" in salida
    assert reporte.como_diccionario()["metadatos_pendientes"]["cantidad"] >= 1


@pytest.mark.ac("US-118", 6)
def test_ingesta_json_invalido_deja_pendiente_y_el_nli_no_recibe_pares(montaje: Montaje) -> None:
    """[US-118 AC-6] Una propuesta que no cumple el esquema no aporta ningún metadato."""
    reporte = _ingerir_ilit1_con_el_llm_caido_o_roto(montaje, "json_invalido")

    _afirmar_pendiente_y_embebido(montaje, reporte)
    assert montaje.nli_metadatos.pares_recibidos == []
    assert "SalidaInvalida" in json.dumps(reporte.como_diccionario())


@pytest.mark.ac("US-118", 6)
def test_ingesta_nli_caido_no_conserva_ningun_metadato_extraido(montaje: Montaje) -> None:
    """[US-118 AC-6] Con el NLI caído no se conserva ningún metadato extraído."""
    montaje.nli_metadatos.error = FalloDeInferencia("nli falso")

    reporte = montaje.ingerir()

    _afirmar_pendiente_y_embebido(montaje, reporte)
    articulo = _registro(montaje, "i-lit-1")
    assert (articulo.trial_phase, articulo.sample_size, articulo.primary_endpoint) == (
        None,
        None,
        None,
    )
    assert "FalloDeInferencia" in json.dumps(reporte.como_diccionario())


@pytest.mark.ac("US-118", 6)
def test_ingesta_con_los_modelos_caidos_nunca_rotula_fuente_estructurada_lo_que_no_se_publico(
    montaje: Montaje,
) -> None:
    """[US-118 AC-6] pendiente nunca es fuente_estructurada; los documentos con criterios estructurados no cambian."""
    reporte = _ingerir_ilit1_con_el_llm_caido_o_roto(montaje, "error")

    rotulos = {r.document_key: r.metadata_source for r in reporte.resultados if r.metadatos}
    assert rotulos["i-lit-1"] == "pendiente" and rotulos["i-lit-2"] == "pendiente"
    assert rotulos["i-ct-1"] == "fuente_estructurada"


SEMILLA_DE_TEST = "semilla-de-test"


def _generador(directorio: Path, montaje: Montaje) -> GeneradorDeMuestraDeMetadatos:
    return GeneradorDeMuestraDeMetadatos(
        pct=10,
        semilla=SEMILLA_DE_TEST,
        escritor=EscritorDeMuestraYaml(directorio),
        reloj=RelojFijo(),
        prompt_version="metadatos_v1",
        llm_model="llm-de-test",
        nli_model=montaje.nli_metadatos.version,
    )


@pytest.mark.ac("US-118", 5)
def test_muestra_lote_20_al_10_por_ciento_elige_2_reproducibles(
    montaje: Montaje, tmp_path: Path
) -> None:
    """[US-118 AC-5] De un lote de 20 documentos extraídos al 10 % se seleccionan 2, siempre los mismos."""
    montaje.llm_metadatos.por_defecto = {"trial_phase": "II", "sample_size": 120}
    lote = lote_sintetico(20)
    reporte = montaje.servicio.ingerir(lote)

    resultado = _generador(tmp_path, montaje).generar(reporte, lote)

    assert resultado.tamano == 2 and resultado.archivo == tmp_path / f"{reporte.release_id}.yaml"
    muestra = yaml.safe_load(resultado.archivo.read_text(encoding="utf-8"))
    assert len(muestra["documentos"]) == 2
    revisiones = {c["revision"] for d in muestra["documentos"] for c in d["campos"]}
    assert revisiones == {"pendiente"}
    elegidos = [d["document_id"] for d in muestra["documentos"]]
    ids = [r.document_id for r in reporte.resultados]
    random.Random(7).shuffle(ids)
    assert list(seleccionar_muestra(ids, 10, SEMILLA_DE_TEST)) == elegidos
    assert muestra["release"] == reporte.release_id and muestra["seed"] == SEMILLA_DE_TEST


@pytest.mark.ac("US-118", 5)
def test_muestra_sin_documentos_extraidos_no_escribe_archivo(
    montaje: Montaje, tmp_path: Path
) -> None:
    """[US-118 AC-5] Sin documentos extraídos no se escribe muestra."""
    estructurados = tuple(
        replace(d, population_criteria={"ecog": "0-1"}) for d in lote_sintetico(20)
    )
    reporte = montaje.servicio.ingerir(estructurados)

    resultado = _generador(tmp_path, montaje).generar(reporte, estructurados)

    assert (resultado.tamano, resultado.archivo) == (0, None)
    assert list(tmp_path.iterdir()) == []
