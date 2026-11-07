"""El seguimiento y la relevancia toman los mismos parámetros de generación desde ``Settings`` (RN-22, Gate 2 P1-2)."""

from app.application.chat.capacidades.afirmaciones_citadas import ParametrosDeGeneracionCitada
from app.application.chat.grafo import ConfiguracionDelGrafo
from app.application.chat.servicio_de_turno import (
    _capacidad_de_relevancia,
    _capacidades_de_evidencia,
)
from app.domain.chat.estado import Subintencion
from app.infrastructure.catalogo_clinico.relevancia import cargar_datos_de_relevancia
from tests.support.contador_de_tokens_falso import ContadorPorPalabras
from tests.support.contract import CATALOGOS
from tests.support.fakes import settings_de_prueba
from tests.support.llm_chat_falso import FakeChatLlm


def test_ambos_nodos_reciben_los_mismos_parametros_cuando_se_construyen_desde_el_mismo_settings():
    ajustes = settings_de_prueba(
        claims_min_per_option=2,
        claims_max_per_option=5,
        claim_max_words=17,
        llm_fragments_max_chars=1234,
        llm_num_ctx=4096,
    )
    servicio, posiciones = object(), object()
    llm, contador = FakeChatLlm("CHAT-OK"), ContadorPorPalabras()
    configuracion = ConfiguracionDelGrafo(100, {}, {})

    _, seguimiento = _capacidades_de_evidencia(
        servicio,  # type: ignore[arg-type]
        posiciones,  # type: ignore[arg-type]
        llm,
        contador,
        configuracion,
        ajustes,
    )
    relevancia = _capacidad_de_relevancia(
        cargar_datos_de_relevancia(CATALOGOS, ("mama",)),
        servicio,  # type: ignore[arg-type]
        posiciones,  # type: ignore[arg-type]
        llm,
        contador,
        ajustes,
    )

    del_seguimiento = seguimiento[Subintencion.seguimiento_evidencia].__self__._parametros  # type: ignore[attr-defined]
    de_la_relevancia = relevancia.__self__._parametros  # type: ignore[union-attr]
    assert del_seguimiento == de_la_relevancia
    assert de_la_relevancia == ParametrosDeGeneracionCitada(
        claims_min=2, claims_max=5, claim_max_words=17, max_chars_fragmentos=1234, num_ctx=4096
    )
