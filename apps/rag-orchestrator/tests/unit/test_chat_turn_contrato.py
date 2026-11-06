"""Contrato aditivo de `POST /chat/turn` en la 1.12.0 (US-259 AC-1, ADR-26): el spec, sus errores y sus ejemplos.

El contrato se editó antes que el código (commits `contract(L1D-316)`); aquí se comprueba el spec publicado, no el servicio.
"""

import json
from pathlib import Path

import pytest
import yaml

from app.schemas.generated.models import (
    ChatTurnRequest,
    ChatTurnResponse,
    ErrorHiloDesconocido,
    ErrorLlmLocalNoDisponible,
)
from tests.support.recuperacion import EJEMPLOS

SPEC = yaml.safe_load(
    (Path(__file__).resolve().parents[2] / "openapi.yaml").read_text(encoding="utf-8")
)
ESQUEMAS = SPEC["components"]["schemas"]
OPERACION = SPEC["paths"]["/chat/turn"]["post"]


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


@pytest.mark.ac("US-259", 1)
def test_el_spec_publica_chat_turn_en_la_1_12_0_con_sus_esquemas_y_errores_cuando_se_lee_el_openapi():
    assert SPEC["info"]["version"] == "1.12.0"
    assert OPERACION["operationId"] == "chatTurn"
    assert set(OPERACION["responses"]) == {"200", "401", "404", "409", "422", "500", "503"}
    assert set(ESQUEMAS["ChatTurnRequest"]["required"]) == {
        "threadId",
        "pseudoPatientId",
        "traceId",
        "question",
        "dataClassification",
        "catalogVersion",
        "clinicalContext",
        "caseFacts",
        "completeness",
    }
    assert "rehydration" not in ESQUEMAS["ChatTurnRequest"]["required"]
    assert set(ESQUEMAS["ChatTurnResponse"]["required"]) == {
        "intent",
        "blocks",
        "omittedClaims",
        "structuredState",
        "llmProvider",
        "notices",
    }
    assert ESQUEMAS["ChatTurnResponse"]["properties"]["subintent"]["enum"] == [
        "seguimiento_evidencia"
    ]
    assert ESQUEMAS["ChatBlock"]["properties"]["kind"]["enum"] == [
        "documentado",
        "interpretacion",
        "catalogo",
        "evidencia",
        "conflicto",
        "faltante",
        "limitacion",
        "fuente",
    ]
    assert ESQUEMAS["ErrorHiloDesconocido"]["properties"]["error"]["const"] == "HILO_DESCONOCIDO"
    assert ESQUEMAS["ErrorInterno"]["properties"]["error"]["const"] == "ERROR_INTERNO"
    assert (
        "analysisId"
        not in ESQUEMAS["StructuredState"]["properties"]["ultimaEvidencia"]["properties"]
    )
    assert "provenance" not in ESQUEMAS["ChatCompletenessItem"]["properties"]
    assert ESQUEMAS["ChatCompletenessItem"]["properties"]["status"]["enum"] == [
        "presente_verificado",
        "presente_sin_verificar",
        "faltante",
        "no_aplica",
    ]
    assert {
        r["$ref"]
        for r in OPERACION["responses"]["503"]["content"]["application/json"]["schema"]["oneOf"]
    } == {
        "#/components/schemas/ErrorLlmLocalNoDisponible",
        "#/components/schemas/ErrorSalidaLlmInvalida",
    }


@pytest.mark.ac("US-259", 1)
@pytest.mark.parametrize(
    ("archivo", "modelo"),
    [
        ("chat-turn-request.json", ChatTurnRequest),
        ("chat-turn-request-rehidratacion.json", ChatTurnRequest),
        ("chat-turn-caso-ok.json", ChatTurnResponse),
        ("chat-turn-no-clasificada.json", ChatTurnResponse),
        ("chat-turn-fuera-de-alcance.json", ChatTurnResponse),
        ("chat-turn-hilo-desconocido.json", ErrorHiloDesconocido),
        ("chat-turn-llm-local-no-disponible.json", ErrorLlmLocalNoDisponible),
    ],
)
def test_los_ejemplos_chat_turn_validan_contra_el_modelo_generado_cuando_se_cargan(archivo, modelo):
    assert modelo.model_validate(_ejemplo(archivo)) is not None


def test_los_ejemplos_con_contenido_generado_llevan_los_avisos_sin_punto_final_cuando_son_respuestas_200():
    caso = _ejemplo("chat-turn-caso-ok.json")

    assert caso["llmProvider"] == "local" and len(caso["notices"]) >= 1
    assert not any(aviso.endswith(".") for aviso in caso["notices"])
    for archivo in ("chat-turn-no-clasificada.json", "chat-turn-fuera-de-alcance.json"):
        assert _ejemplo(archivo)["notices"] == []
