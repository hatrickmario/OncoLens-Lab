"""``MetadataExtractionService`` con adapters falsos (US-118): guardas del paso de metadatos, una a una."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest

from app.application.corpus_ingestion.reporte import Estado, ReporteDeIngesta, ResultadoDeIngesta
from app.application.corpus_metadata.metadata_extraction_service import MetadataExtractionService
from app.application.ports import FalloDeInferencia
from app.domain.corpus_metadata.resultado import FalloDeMetadatos
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.nli import ParNli, ResultadoNli
from tests.support.metadatos import (
    ENDPOINT_INVENTADO,
    MARCADOR_I_LIT_1,
    UMBRAL_NLI_DE_TEST,
    FakeMetadataLlm,
    nli_de_metadatos,
)
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso

TEXTO = f"{MARCADOR_I_LIT_1} and a trial."
FRAGMENTOS = [TEXTO, "segundo fragmento del mismo documento"]
DOCUMENTO = DocumentoDeSemilla(
    document_key="i-lit-1",
    version_group_id="i-lit-1",
    source_type="literature",
    source_name="PMC Open Access",
    external_id="sintetico-pmc-1",
    title="Revisión sintética",
    language="en",
    cancer_type_tags=("mama",),
    published_at=date(2023, 11, 20),
    study_design="otro",
    population="adulto",
    original_format="jats_xml",
)


def _servicio(llm: FakeMetadataLlm, nli: NliFalso | None = None) -> MetadataExtractionService:
    return MetadataExtractionService(
        llm=llm, nli=nli or nli_de_metadatos(), umbral_nli=UMBRAL_NLI_DE_TEST
    )


def test_el_servicio_conserva_lo_verificado_y_descarta_lo_que_el_nli_no_confirma() -> None:
    metadatos = _servicio(FakeMetadataLlm()).resolver(DOCUMENTO, TEXTO, FRAGMENTOS)

    assert (metadatos.trial_phase, metadatos.sample_size) == ("III", 500)
    assert metadatos.primary_endpoint is None
    assert metadatos.metadata_source == "extraido_verificado" and metadatos.fallo is None


def test_el_servicio_verifica_cada_campo_contra_cada_fragmento_del_documento() -> None:
    nli = nli_de_metadatos()

    _servicio(FakeMetadataLlm(), nli).resolver(DOCUMENTO, TEXTO, FRAGMENTOS)

    premisas = {par.premisa for par in nli.pares_recibidos}
    assert premisas == set(FRAGMENTOS)


class _NliQueSoloImplicaEn(NliFalso):
    """NLI falso que confirma únicamente contra una premisa (un chunk) y es neutral con las demás."""

    def __init__(self, premisa: str) -> None:
        super().__init__(por_defecto=NEUTRAL)
        self._premisa = premisa

    def _resultado_de(self, par: ParNli) -> ResultadoNli:
        return IMPLICA if par.premisa == self._premisa else NEUTRAL


def test_el_servicio_conserva_un_campo_cuando_solo_un_fragmento_lo_implica() -> None:
    nli = _NliQueSoloImplicaEn(FRAGMENTOS[1])

    metadatos = _servicio(FakeMetadataLlm(), nli).resolver(DOCUMENTO, TEXTO, FRAGMENTOS)

    assert metadatos.trial_phase == "III"


def test_el_servicio_descarta_un_campo_cuando_ningun_fragmento_lo_implica() -> None:
    nli = _NliQueSoloImplicaEn("una premisa que no es ningun fragmento")

    metadatos = _servicio(FakeMetadataLlm(), nli).resolver(DOCUMENTO, TEXTO, FRAGMENTOS)

    assert (metadatos.trial_phase, metadatos.sample_size) == (None, None)
    assert metadatos.campos_verificados == ()


def test_el_servicio_ignora_lo_que_el_llm_propone_para_un_escalar_que_el_manifiesto_declara() -> (
    None
):
    declarado = replace(DOCUMENTO, study_design="observacional", trial_phase="II")

    metadatos = _servicio(FakeMetadataLlm()).resolver(declarado, TEXTO, FRAGMENTOS)

    assert (metadatos.study_design, metadatos.trial_phase) == ("observacional", "II")
    assert metadatos.sample_size == 500


def test_el_prompt_del_servicio_no_pide_los_escalares_que_el_manifiesto_declara() -> None:
    llm = FakeMetadataLlm()
    declarado = replace(DOCUMENTO, study_design="eca", trial_phase="II", sample_size=40)

    _servicio(llm).resolver(declarado, TEXTO, FRAGMENTOS)

    linea = next(x for x in llm.prompts[0].splitlines() if x.startswith("Campos solicitados"))
    assert "primary_endpoint" in linea
    assert not {"study_design", "trial_phase", "sample_size"} & set(linea.replace(",", " ").split())


def test_el_servicio_deja_pendiente_con_la_clase_del_error_cuando_el_nli_cae() -> None:
    nli = nli_de_metadatos(error=FalloDeInferencia("x"))

    metadatos = _servicio(FakeMetadataLlm(), nli).resolver(DOCUMENTO, TEXTO, FRAGMENTOS)

    assert metadatos.metadata_source == "pendiente"
    assert metadatos.fallo == FalloDeMetadatos("FalloDeInferencia")


def test_el_servicio_no_oculta_un_defecto_que_no_es_un_fallo_del_llm_ni_del_nli() -> None:
    class LlmRoto(FakeMetadataLlm):
        async def completar_json(self, prompt, esquema):  # type: ignore[no-untyped-def]
            raise ZeroDivisionError

    with pytest.raises(ZeroDivisionError):
        _servicio(LlmRoto()).resolver(DOCUMENTO, TEXTO, FRAGMENTOS)


def test_el_servicio_no_pregunta_al_nli_cuando_el_llm_no_propone_nada() -> None:
    nli = nli_de_metadatos()

    metadatos = _servicio(FakeMetadataLlm(propuestas={}), nli).resolver(
        DOCUMENTO, TEXTO, FRAGMENTOS
    )

    assert nli.invocaciones == 0
    assert metadatos.metadata_source == "extraido_verificado"
    assert metadatos.campos_verificados == ()


def test_el_valor_inventado_nunca_llega_a_los_metadatos_resueltos() -> None:
    metadatos = _servicio(FakeMetadataLlm()).resolver(DOCUMENTO, TEXTO, FRAGMENTOS)

    assert ENDPOINT_INVENTADO not in str(metadatos)


def test_el_reporte_resume_los_pendientes_con_etapa_y_clase_sin_mensaje() -> None:
    pendiente = replace(
        _servicio(FakeMetadataLlm(modo="error")).resolver(DOCUMENTO, TEXTO, FRAGMENTOS)
    )
    reporte = ReporteDeIngesta(
        (ResultadoDeIngesta("i-lit-1", Estado.EMBEBIDO, metadatos=pendiente),), "release-1"
    )

    resumen = reporte.como_diccionario()["metadatos_pendientes"]

    assert resumen == {
        "cantidad": 1,
        "documentos": [{"document_key": "i-lit-1", "motivo": "metadatos: FalloDelLlm"}],
    }
    assert reporte.contadores()["embebido"] == 1
