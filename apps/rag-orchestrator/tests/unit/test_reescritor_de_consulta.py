"""Adapter de la reescritura (US-238) con el cliente del LLM fingido en su borde, la configuración y el seguimiento."""

import asyncio
import json

import pytest

from app.application.corpus_metadata.poblacion_puertos import RespuestaDelLlm
from app.application.ports import FalloDelLlm, SalidaDeReescrituraInvalida
from app.domain.reescritura import EstadoDeReescritura, MotivoDeReescritura
from app.infrastructure.llm.fabrica_local import parametros_de_reescritura
from app.infrastructure.llm.reescritor_de_consulta import ReescritorDeConsultaLocal
from app.schemas.generated.models import RagQueryInternalRequest
from tests.support.fakes import RelojFijo, settings_de_prueba
from tests.support.recuperacion import RELEASE_DE_TEST, Q_HER2, crear_entorno, solicitud_de
from tests.support.reescritura import ReescritorFalso


class LlmFalso:
    def __init__(
        self, texto: str = "", finish_reason: str = "stop", error: Exception | None = None
    ):
        self._respuesta = RespuestaDelLlm(texto, finish_reason)
        self._error = error
        self.prompts: list[str] = []
        self.esquemas: list[dict] = []

    async def completar_json_acotado(self, prompt, esquema, *, max_tokens, semilla):
        self.prompts.append(prompt)
        self.esquemas.append(dict(esquema))
        if self._error is not None:
            raise self._error
        return self._respuesta


def _adaptador(llm: LlmFalso) -> ReescritorDeConsultaLocal:
    return ReescritorDeConsultaLocal(llm, max_terminos=3, max_tokens_de_salida=64)


def test_reformular_devuelve_los_terminos_y_pone_solo_la_pregunta_en_el_prompt():
    llm = LlmFalso(json.dumps({"terminos": ["ribociclib", "CDK4/6"]}))

    terminos = asyncio.run(_adaptador(llm).reformular(Q_HER2))

    assert terminos == ("ribociclib", "CDK4/6")
    assert Q_HER2 in llm.prompts[0]
    assert llm.esquemas[0]["properties"]["terminos"]["maxItems"] == 3
    for ajeno in ("clinicalContext", "pseudoPatientId", "analysisMemory"):
        assert ajeno not in llm.prompts[0]


@pytest.mark.parametrize(
    "llm",
    [
        LlmFalso("no es json"),
        LlmFalso(json.dumps({"terminos": "ribociclib"})),
        LlmFalso(json.dumps({"terminos": [], "otro": 1})),
        LlmFalso(json.dumps({"terminos": ["x"]}), finish_reason="length"),
    ],
    ids=["no_json", "forma_invalida", "campo_extra", "cortada"],
)
def test_reformular_falla_sin_detalle_cuando_la_salida_no_valida(llm):
    with pytest.raises(SalidaDeReescrituraInvalida) as error:
        asyncio.run(_adaptador(llm).reformular(Q_HER2))

    assert "terminos" not in str(error.value)


def test_reformular_deja_pasar_el_fallo_del_llm_cuando_esta_caido():
    with pytest.raises(FalloDelLlm):
        asyncio.run(_adaptador(LlmFalso(error=FalloDelLlm("caído"))).reformular(Q_HER2))


def test_el_seguimiento_traza_no_aplica_y_no_invoca_la_reescritura():
    reescritor = ReescritorFalso()
    entorno = crear_entorno(reescritor=reescritor)
    solicitud = RagQueryInternalRequest.model_validate(solicitud_de(Q_HER2))

    meta = entorno.servicio._armar_meta_de_recuperacion(
        solicitud,
        "es",
        RELEASE_DE_TEST,
        RelojFijo().ahora(),
        EstadoDeReescritura(MotivoDeReescritura.no_aplica),
    )

    assert meta.retrievalParams.queryRewrite.applied is False
    assert meta.retrievalParams.queryRewrite.reason.value == "no_aplica"
    assert reescritor.invocaciones == 0


def test_la_reescritura_se_configura_desde_settings_y_arranca_desactivada():
    por_defecto = parametros_de_reescritura(settings_de_prueba())
    ajustada = parametros_de_reescritura(
        settings_de_prueba(
            query_rewrite_enabled=True,
            query_rewrite_max_iterations=2,
            query_rewrite_deadline_ms=500,
        )
    )

    assert por_defecto.habilitada is False
    assert (ajustada.habilitada, ajustada.max_iteraciones, ajustada.plazo_ms) == (True, 2, 500)
