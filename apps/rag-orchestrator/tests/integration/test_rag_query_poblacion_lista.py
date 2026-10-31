"""`POST /rag/query`, estado de cada criterio con la población en lista por fragmento (US-243 / L1D-293): FR-25, RN-28.

FX-08b-c: pacientes A-M2 y A-M3, corpus ``doc-b1``…``doc-b10`` en la forma de lista de US-241, catálogo ``test-apl-1.2.0``
y el LLM falso ``LLM-POB``; NLI, reranker y Milvus falsos. La unidad de cálculo es el fragmento que cita la opción
(ADR-47). Cada respuesta la valida contra el spec del proveedor el hook de ``verificacion_proveedor.py``.
"""

from typing import Any

import pytest

from tests.support.poblacion_fx08bc import (
    FICHAS_FX08BC,
    entorno_fx08bc,
    solicitud_a_m2,
    solicitud_a_m3,
    texto_de_opcion,
)
from tests.support.proponente_falso import ProponenteFalso


def _consultar(
    *opciones: str,
    paciente: dict[str, Any] | None = None,
    proponente: ProponenteFalso | None = None,
) -> dict[str, Any]:
    entorno = entorno_fx08bc(*opciones, proponente=proponente)
    respuesta = entorno.consultar(paciente or solicitud_a_m2())
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "con_evidencia"
    return cuerpo


def _criterio(cuerpo: dict[str, Any], documento: str, criterio: str) -> dict[str, Any]:
    externo = FICHAS_FX08BC[documento].external_id
    fuentes = [f for f in cuerpo["applicability"] if f["externalId"] == externo]
    assert len(fuentes) == 1, f"se esperaba una sola fuente para {documento}"
    return {c["criterion"]: c for c in fuentes[0]["criteria"]}[criterio]


def _fuente(cuerpo: dict[str, Any], documento: str) -> dict[str, Any]:
    externo = FICHAS_FX08BC[documento].external_id
    return next(f for f in cuerpo["applicability"] if f["externalId"] == externo)


def _opcion(cuerpo: dict[str, Any], identificador: str) -> dict[str, Any]:
    return next(
        o for o in cuerpo["evidenceOptions"] if o["option"] == texto_de_opcion(identificador)
    )


def _valores(chunk: str, *textos: str, alcance: str = "elegibilidad") -> list[dict[str, str]]:
    return [{"value": t, "chunkId": chunk, "scope": alcance} for t in textos]


@pytest.mark.ac("US-243", 1)
def test_rag_query_estado_menopausico_parcial_inclusiva_cuando_la_opcion_cita_ch_b1_1():
    cuerpo = _consultar("O-P1")

    menopausia = _criterio(cuerpo, "doc-b1", "estado_menopausico")
    assert menopausia["patientValue"] == "posmenopáusica"
    assert menopausia["status"] == "parcial"
    assert menopausia["partialReason"] == "inclusiva"
    assert menopausia["studyPopulationValues"] == _valores(
        "ch-b1-1", "premenopausal women", "postmenopausal women"
    )


@pytest.mark.ac("US-243", 2)
def test_rag_query_estado_menopausico_coincide_cuando_la_poblacion_es_especifica_del_perfil():
    cuerpo = _consultar("O-P2")

    menopausia = _criterio(cuerpo, "doc-b2", "estado_menopausico")
    assert menopausia["status"] == "coincide"
    assert menopausia.get("partialReason") is None
    assert menopausia["unknownReason"] is None


@pytest.mark.ac("US-243", 3)
def test_rag_query_estado_menopausico_no_coincide_cuando_la_restriccion_explicita_excluye_al_paciente():
    cuerpo = _consultar("O-P2", paciente=solicitud_a_m3())

    menopausia = _criterio(cuerpo, "doc-b2", "estado_menopausico")
    assert menopausia["patientValue"] == "premenopáusica"
    assert menopausia["status"] == "no_coincide"
    assert menopausia["studyPopulationValues"] == _valores("ch-b2-1", "postmenopausal women only")
    assert _fuente(cuerpo, "doc-b2")["populationNotComparable"] is False  # no es excluyente


@pytest.mark.ac("US-243", 4)
def test_rag_query_estado_menopausico_desconocido_cuando_la_lista_no_tiene_marcador_de_restriccion():
    cuerpo = _consultar("O-P3", paciente=solicitud_a_m3())

    menopausia = _criterio(cuerpo, "doc-b3", "estado_menopausico")
    assert menopausia["status"] == "desconocido"
    assert menopausia["unknownReason"] == "no_reportado_por_fuente"
    assert menopausia["status"] != "no_coincide"


@pytest.mark.ac("US-243", 5)
def test_rag_query_estado_her2_desconocido_con_ambos_valores_cuando_dos_fragmentos_se_excluyen():
    cuerpo = _consultar("O-P4")

    her2 = _criterio(cuerpo, "doc-b4", "estado_her2")
    assert her2["status"] == "desconocido"
    assert her2["unknownReason"] == "valores_en_conflicto"
    assert her2["studyPopulationValues"] == [
        *_valores("ch-b4-1", "HER2-positive (IHC 3+)"),
        *_valores("ch-b4-2", "HER2-negative (IHC 2+, ISH not amplified)"),
    ]
    assert _fuente(cuerpo, "doc-b4")["populationNotComparable"] is False
    assert _opcion(cuerpo, "O-P4")["populationNotComparable"] is False


@pytest.mark.ac("US-243", 6)
def test_rag_query_receptores_desconocido_con_el_subgrupo_como_contexto_cuando_solo_hay_subgrupo():
    cuerpo = _consultar("O-P6")

    receptores = _criterio(cuerpo, "doc-b6", "receptores_hormonales")
    assert receptores["status"] == "desconocido"
    assert receptores["unknownReason"] == "no_reportado_por_fuente"
    assert receptores["studyPopulationValues"] == _valores(
        "ch-b6-1", "triple-negative (TNBC)", alcance="subgrupo"
    )
    resumen = _fuente(cuerpo, "doc-b6")["summary"]
    assert (resumen["coincide"], resumen["parcial"]) == (0, 0)


@pytest.mark.ac("US-243", 7)
def test_rag_query_cada_opcion_usa_solo_el_fragmento_que_cita_cuando_comparten_documento():
    cuerpo = _consultar("O-P7", "O-P8")

    resumen_p7 = _opcion(cuerpo, "O-P7")["applicabilitySummary"]
    resumen_p8 = _opcion(cuerpo, "O-P8")["applicabilitySummary"]
    assert (resumen_p7["coincide"], resumen_p7["noCoincide"]) == (1, 0)
    assert (resumen_p8["coincide"], resumen_p8["noCoincide"]) == (0, 1)


@pytest.mark.ac("US-243", 7)
def test_rag_query_ningun_valor_de_un_fragmento_no_citado_entra_cuando_la_opcion_cita_ch_b7_1():
    cuerpo = _consultar("O-P7")

    menopausia = _criterio(cuerpo, "doc-b7", "estado_menopausico")
    assert menopausia["status"] == "coincide"
    assert menopausia["studyPopulationValues"] == _valores("ch-b7-1", "postmenopausal women only")


@pytest.mark.ac("US-243", 8)
def test_rag_query_estado_menopausico_parcial_mezclada_cuando_la_guia_mezcla_poblaciones():
    proponente = ProponenteFalso()

    cuerpo = _consultar("O-P5", proponente=proponente)

    menopausia = _criterio(cuerpo, "doc-b5", "estado_menopausico")
    assert menopausia["status"] == "parcial"
    assert menopausia["partialReason"] == "mezclada"
    # El estado lo calculan las reglas puras: el LLM textual (US-123) nunca recibe el criterio ya leído de la lista. La
    # aserción original «cero invocaciones» no podía cumplirse por HTTP: los demás criterios sin valor sí van al texto.
    preguntados = {c.clave for f in proponente.llamadas for c in f.criterios}
    assert "estado_menopausico" not in preguntados
