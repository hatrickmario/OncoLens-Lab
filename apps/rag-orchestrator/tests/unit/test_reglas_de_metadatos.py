"""Reglas puras de metadatos del corpus (US-118): verificación por NLI, qué se pide al LLM y cómo se integra lo verificado.

Sin adapters: las reglas viven en ``app/domain/corpus_metadata``.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest

from app.application.seed_corpus.registros import registro_embebido
from app.domain.corpus_metadata.extraccion import (
    campos_conservados,
    escalares_a_extraer,
    integrar_metadatos_verificados,
)
from app.domain.corpus_metadata.resultado import CampoDeMetadato
from app.domain.corpus_metadata.verificacion import metadato_verificado
from app.domain.corpus_seed.admisibilidad import Admision
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.poblacion import NO_DISPONIBLE
from app.domain.nli import ResultadoNli
from tests.support.fakes import RelojFijo

UMBRAL = 0.8
DOCUMENTO = DocumentoDeSemilla(
    document_key="d-1",
    version_group_id="d-1",
    source_type="literature",
    source_name="PMC Open Access",
    external_id="sintetico-1",
    title="Artículo sintético",
    language="en",
    cancer_type_tags=("mama",),
    published_at=date(2024, 1, 1),
    study_design="otro",
    population="adulto",
    original_format="jats_xml",
)


def _implica(p: float) -> ResultadoNli:
    return ResultadoNli(label="entailment", p_entailment=p)


def test_un_metadato_se_verifica_cuando_algun_chunk_lo_implica_sobre_el_umbral() -> None:
    neutral = ResultadoNli(label="neutral", p_entailment=0.1)

    assert metadato_verificado([neutral, _implica(0.95)], UMBRAL)


def test_un_metadato_se_verifica_justo_en_el_umbral() -> None:
    assert metadato_verificado([_implica(UMBRAL)], UMBRAL)


def test_un_metadato_no_se_verifica_bajo_el_umbral() -> None:
    assert not metadato_verificado([_implica(0.79)], UMBRAL)


def test_un_metadato_no_se_verifica_cuando_la_clase_mas_probable_no_es_entailment() -> None:
    contradice = ResultadoNli(label="contradiction", p_entailment=0.99)

    assert not metadato_verificado([contradice], UMBRAL)


def test_un_metadato_no_se_verifica_sin_resultados() -> None:
    assert not metadato_verificado([], UMBRAL)


def test_se_extrae_el_diseno_cuando_el_manifiesto_lo_deja_en_otro() -> None:
    assert escalares_a_extraer(DOCUMENTO) == (
        "study_design",
        "trial_phase",
        "sample_size",
        "primary_endpoint",
    )


def test_no_se_pide_al_llm_lo_que_el_manifiesto_declara() -> None:
    declarado = replace(
        DOCUMENTO, study_design="eca", trial_phase="II", sample_size=40, primary_endpoint="OS"
    )

    assert escalares_a_extraer(declarado) == ()


def test_lo_verificado_se_integra_y_lo_demas_queda_no_disponible() -> None:
    verificados = (
        CampoDeMetadato("study_design", "eca"),
        CampoDeMetadato("sample_size", 500),
        CampoDeMetadato("estadio", "I–III"),
        CampoDeMetadato("biomarcadores.her2", "positivo"),
    )

    metadatos = integrar_metadatos_verificados(DOCUMENTO, verificados)

    assert (metadatos.study_design, metadatos.sample_size) == ("eca", 500)
    assert (metadatos.trial_phase, metadatos.primary_endpoint) == (None, None)
    assert metadatos.population_criteria["estadio"] == "I–III"
    assert metadatos.population_criteria["biomarcadores"] == {"her2": "positivo"}
    assert metadatos.population_criteria["ecog"] == NO_DISPONIBLE
    assert metadatos.metadata_source == "extraido_verificado"


def test_un_diseno_no_verificado_conserva_el_valor_del_manifiesto() -> None:
    metadatos = integrar_metadatos_verificados(DOCUMENTO, ())

    assert metadatos.study_design == "otro"
    assert metadatos.metadata_source == "extraido_verificado"


@pytest.mark.parametrize("campo", ["subtipo", "estadio", "linea", "edad", "ecog"])
def test_cada_criterio_plano_verificado_se_guarda_bajo_su_clave(campo: str) -> None:
    metadatos = integrar_metadatos_verificados(DOCUMENTO, (CampoDeMetadato(campo, "valor"),))

    assert metadatos.population_criteria[campo] == "valor"


def test_los_campos_conservados_de_una_fila_son_los_escalares_y_criterios_no_vacios() -> None:
    campos = campos_conservados(
        "eca",
        "III",
        500,
        None,
        {
            "subtipo": NO_DISPONIBLE,
            "estadio": "I–III",
            "biomarcadores": {"her2": "positivo"},
            "ecog": NO_DISPONIBLE,
        },
    )

    assert [(c.campo, c.valor) for c in campos] == [
        ("study_design", "eca"),
        ("trial_phase", "III"),
        ("sample_size", 500),
        ("biomarcadores.her2", "positivo"),
        ("estadio", "I–III"),
    ]


def test_los_campos_conservados_de_la_forma_de_lista_resumen_los_valores_y_ignoran_vacios_y_pendientes() -> (
    None
):
    valor = {
        "value": "stage II",
        "chunkId": "c1",
        "scope": "elegibilidad",
        "promptVersion": "p",
        "modelVersion": "m",
        "catalogVersion": "c",
        "nliResult": "entailment",
    }
    campos = campos_conservados(
        "otro",
        None,
        None,
        None,
        {
            "estadio": [valor, {**valor, "value": "stage III"}],
            "ecog": [],
            "linea": {"status": "pendiente", "values": []},
        },
    )

    assert [(c.campo, c.valor) for c in campos] == [("estadio", "stage II; stage III")]


def test_una_fila_sin_nada_conservado_no_tiene_campos_y_otro_es_no_declarado() -> None:
    assert campos_conservados("otro", None, None, None, {"biomarcadores": NO_DISPONIBLE}) == ()


AHORA = RelojFijo().ahora()
ADMITIDO = Admision(None, "dominio_publico")


def test_una_fila_extraido_verificado_sin_ningun_campo_verificado_no_registra_campos_extraidos_aunque_el_manifiesto_declare_uno() -> (
    None
):
    """Decidido (usuario, 2026-10-24): ``extracted_fields`` distingue lo extraído de lo declarado por el manifiesto."""
    declarado = replace(DOCUMENTO, study_design="eca")

    fila = integrar_metadatos_verificados(declarado, ())
    registro = registro_embebido(declarado, ADMITIDO, "ab" * 32, AHORA, fila)

    assert fila.study_design == "eca" and registro.extracted_fields == ()


def test_los_campos_verificados_quedan_como_campos_extraidos_de_la_fila() -> None:
    fila = integrar_metadatos_verificados(
        DOCUMENTO,
        (CampoDeMetadato("trial_phase", "III"), CampoDeMetadato("biomarcadores.her2", "positivo")),
    )

    registro = registro_embebido(DOCUMENTO, ADMITIDO, "ab" * 32, AHORA, fila)

    assert registro.extracted_fields == ("trial_phase", "biomarcadores.her2")


def test_ida_y_vuelta_de_los_campos_verificados_por_integrar_y_campos_conservados() -> None:
    verificados = (
        CampoDeMetadato("study_design", "eca"),
        CampoDeMetadato("trial_phase", "III"),
        CampoDeMetadato("sample_size", 500),
        CampoDeMetadato("biomarcadores.her2", "positivo"),
        CampoDeMetadato("estadio", "I–III"),
    )

    fila = integrar_metadatos_verificados(DOCUMENTO, verificados)
    de_vuelta = campos_conservados(
        fila.study_design,
        fila.trial_phase,
        fila.sample_size,
        fila.primary_endpoint,
        fila.population_criteria,
    )

    assert set(de_vuelta) == set(verificados)
