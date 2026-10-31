import json

from app.infrastructure.fake.fake_evidence_query import FakeEvidenceQuery
from app.schemas.generated.models import RagQueryInternalResponse, RagQueryStatus
from tests.support.contract import RAIZ_REPOSITORIO

EJEMPLOS = RAIZ_REPOSITORIO / "contracts/examples"


def _respuesta(nombre: str) -> RagQueryInternalResponse:
    return RagQueryInternalResponse.model_validate_json(
        (EJEMPLOS / nombre).read_text(encoding="utf-8")
    )


def _pregunta(nombre: str) -> str:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))["query"]


def test_select_fixture_response_devuelve_la_respuesta_asociada_cuando_la_pregunta_coincide_exacta():
    fake = FakeEvidenceQuery.desde_directorio(EJEMPLOS)

    elegida = fake.select_fixture_response(_pregunta("rag-query-request.json"))

    assert elegida == _respuesta("rag-query-con-evidencia.json")


def test_select_fixture_response_devuelve_sin_evidencia_cuando_la_pregunta_solo_difiere_en_mayusculas():
    fake = FakeEvidenceQuery.desde_directorio(EJEMPLOS)

    elegida = fake.select_fixture_response(_pregunta("rag-query-request.json").upper())

    assert elegida.status == RagQueryStatus.sin_evidencia
    assert elegida.topRelevanceScore is None


def test_desde_directorio_carga_los_ejemplos_demo_s4_cuando_el_smoke_monta_contracts_examples():
    # El stack-smoke monta contracts/examples con LLM_PROVIDER=fake: un ejemplo que no cumpla
    # RagQueryInternalResponse (p. ej. sin optionsNotShown) hace salir al contenedor con código 1 (L1D-297).
    fake = FakeEvidenceQuery.desde_directorio(EJEMPLOS)
    for nombre in ("her2-adyuvante", "cdk46-excluyente"):
        pregunta = _pregunta(f"rag-query-request-demo-s4-mama-{nombre}.json")
        respuesta = fake.select_fixture_response(pregunta)
        assert respuesta.status == RagQueryStatus.con_evidencia
        assert respuesta.optionsNotShown == 0
