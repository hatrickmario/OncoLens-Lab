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


@pytest.mark.parametrize(
    "nombre",
    ["../README.md", "/etc/hosts", "sub/ejemplo.json", "sub\\ejemplo.json", "..", "", "a..b.json"],
)
def test_handler_desde_ejemplo_rechaza_nombres_que_salen_de_contracts_examples(nombre):
    with respx.mock() as router:
        with pytest.raises(AssertionError) as fallo:
            handler_desde_ejemplo(router, "get", URL, nombre)

    assert "no es un nombre de archivo de contracts/examples/" in str(fallo.value)


def test_handler_desde_ejemplo_rechaza_un_enlace_que_apunta_fuera_de_la_carpeta(tmp_path):
    fuera = tmp_path / "fuera.json"
    fuera.write_text("{}", encoding="utf-8")
    carpeta = tmp_path / "ejemplos"
    carpeta.mkdir()
    (carpeta / "enlace.json").symlink_to(fuera)

    with respx.mock() as router:
        with pytest.raises(AssertionError) as fallo:
            handler_desde_ejemplo(router, "get", URL, "enlace.json", carpeta=carpeta)

    assert "no es un nombre de archivo de contracts/examples/" in str(fallo.value)


def test_handler_desde_ejemplo_falla_con_sobrescribir_vacio_cuando_el_ejemplo_no_es_un_objeto(
    tmp_path,
):
    (tmp_path / "lista.json").write_text("[1, 2]", encoding="utf-8")

    with respx.mock() as router:
        with pytest.raises(AssertionError) as fallo:
            handler_desde_ejemplo(
                router, "get", URL, "lista.json", sobrescribir={}, carpeta=tmp_path
            )

    assert "no es un objeto en el ejemplo lista.json" in str(fallo.value)


def test_handler_desde_ejemplo_responde_el_ejemplo_no_objeto_cuando_no_se_sobrescribe(tmp_path):
    (tmp_path / "lista.json").write_text("[1, 2]", encoding="utf-8")

    with respx.mock() as router:
        handler_desde_ejemplo(router, "get", URL, "lista.json", carpeta=tmp_path)
        respuesta = httpx.get(URL)

    assert respuesta.json() == [1, 2]
