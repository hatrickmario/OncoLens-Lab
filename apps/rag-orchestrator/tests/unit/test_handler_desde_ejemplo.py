"""Los handlers de respx salen del ejemplo del contrato (L1D-285, US-213 AC-10, ADR-26)."""

import httpx
import pytest
import respx

from tests.support.http import cargar_ejemplo, handler_desde_ejemplo

EJEMPLO = "rag-query-con-evidencia.json"
URL = "http://rag-orchestrator.test/rag/query"


def _responder(router: respx.MockRouter, **opciones) -> httpx.Response:
    handler_desde_ejemplo(router, "post", URL, EJEMPLO, **opciones)
    return httpx.post(URL, json={})


@pytest.mark.ac("US-213", 10)
def test_handler_desde_ejemplo_falla_nombrando_el_campo_y_el_ejemplo_cuando_la_clave_no_existe():
    with respx.mock() as router:
        with pytest.raises(AssertionError) as fallo:
            handler_desde_ejemplo(
                router, "post", URL, EJEMPLO, sobrescribir={"campoInventado": "x"}
            )

    assert 'el campo "campoInventado" no existe en el ejemplo rag-query-con-evidencia.json' in str(
        fallo.value
    )


def test_handler_desde_ejemplo_responde_el_ejemplo_tal_cual_cuando_no_se_sobrescribe_nada():
    with respx.mock() as router:
        respuesta = _responder(router)

    assert respuesta.status_code == 200
    assert respuesta.json() == cargar_ejemplo(EJEMPLO)


def test_handler_desde_ejemplo_responde_el_valor_sobrescrito_cuando_la_clave_existe():
    with respx.mock() as router:
        respuesta = _responder(router, sobrescribir={"status": "otro_estado"}, status=207)

    assert respuesta.status_code == 207
    assert respuesta.json()["status"] == "otro_estado"
    assert respuesta.json()["synthesis"] == cargar_ejemplo(EJEMPLO)["synthesis"]


def test_handler_desde_ejemplo_nombra_la_ruta_anidada_cuando_la_clave_interna_no_existe():
    with respx.mock() as router:
        with pytest.raises(AssertionError) as fallo:
            handler_desde_ejemplo(
                router, "post", URL, EJEMPLO, sobrescribir={"retrievalStats": {"inventado": 1}}
            )

    assert 'el campo "retrievalStats.inventado" no existe' in str(fallo.value)


def test_handler_desde_ejemplo_no_modifica_el_ejemplo_cargado_cuando_sobrescribe():
    antes = cargar_ejemplo(EJEMPLO)
    with respx.mock() as router:
        _responder(router, sobrescribir={"status": "otro_estado"})

    assert cargar_ejemplo(EJEMPLO) == antes


def test_handler_desde_ejemplo_nombra_el_archivo_cuando_el_ejemplo_no_existe():
    with respx.mock() as router:
        with pytest.raises(AssertionError) as fallo:
            handler_desde_ejemplo(router, "get", URL, "no-existe.json")

    assert "no se pudo leer el ejemplo no-existe.json" in str(fallo.value)


def test_handler_desde_ejemplo_entrega_cada_peticion_a_al_recibir():
    recibidas: list[str] = []
    with respx.mock() as router:
        _responder(router, al_recibir=lambda peticion: recibidas.append(peticion.method))

    assert recibidas == ["POST"]
