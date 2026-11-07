"""`POST /rag/query` con el segundo loop contextual (US-271 / L1D-329, ADR-52): adapters falsos sobre FX-06a-a.

El servicio es el real, con el léxico y el catálogo de términos reales; embedder, reranker, LLM, NLI y Milvus son falsos con
contadores. Cada respuesta la valida contra el spec del proveedor el hook de `verificacion_proveedor.py` (US-214); los
escenarios de «ausente» miran el JSON crudo, no el modelo Pydantic. Solo datos sintéticos.
"""

import json
import logging
from dataclasses import replace

import pytest
from pydantic import ValidationError

from app.config.errores_de_configuracion import describir_errores
from app.domain.reescritura import ParametrosDeReescritura
from app.domain.terminos_del_caso import CatalogoDeTerminos
from tests.support.arnes_contextual import (
    CON_REESCRITURA_DE_PRUEBA,
    CAMPOS_USADOS,
    CONSULTA_CONTEXTUAL,
    Q_GENERICA,
    crear_entorno_contextual,
    expansion_de,
    parametros_contextuales,
    puntajes_contextuales,
    solicitud_contextual,
)
from tests.support.expansion_contextual import preguntas_de_la_medicion
from tests.support.fakes import settings_de_prueba
from tests.support.generador_falso import FakeEvidenceGenerator
from tests.support.recuperacion import EJEMPLOS, Q_HER2, RerankerFalso
from tests.support.reescritura import (
    CATALOGO_DE_PRUEBA,
    PUNTAJES_DE_REESCRITURA,
    Q_TYPO,
    EmbedderDeReescritura,
    ReescritorFalso,
    parametros_de_reescritura,
)

CON_REESCRITURA = CON_REESCRITURA_DE_PRUEBA


def _reescritura(cuerpo: dict) -> dict:
    return cuerpo["meta"]["retrievalParams"]["queryRewrite"]


def _citas_de(cuerpo: dict) -> set[str]:
    return {c["chunkId"] for o in cuerpo["evidenceOptions"] for c in o["citedSources"]}


@pytest.mark.ac("US-271", 1)
def test_rag_query_responde_con_evidencia_y_citas_del_turno_cuando_una_pregunta_sin_tema_dispara_un_unico_loop_contextual_sin_llm():
    reescritor = ReescritorFalso()
    entorno = crear_entorno_contextual(
        parametros=parametros_contextuales(reescritura=CON_REESCRITURA), reescritor=reescritor
    )

    respuesta = entorno.consultar(solicitud_contextual())

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "con_evidencia"
    assert entorno.reranker.preguntas == [Q_GENERICA, CONSULTA_CONTEXTUAL]
    assert entorno.embedder.textos.count(CONSULTA_CONTEXTUAL) == 1  # una recuperación más, solo una
    assert reescritor.invocaciones == 0  # el segundo loop contextual no invoca ningún LLM
    assert entorno.generador.invocaciones == 1
    recuperados = {c for lote in entorno.reranker.candidatos_recibidos for c in lote}
    assert _citas_de(cuerpo) and _citas_de(cuerpo) <= recuperados
    assert expansion_de(cuerpo) == {"applied": True, "fields": CAMPOS_USADOS}
    assert _reescritura(cuerpo) == {"applied": False, "reason": "no_disparado"}


def test_rag_query_añade_tipo_estadio_grado_y_biomarcador_del_catalogo_cuando_el_caso_es_de_prostata():
    entorno = crear_entorno_contextual()
    solicitud = solicitud_contextual(estadio="IIB", biomarcadores=(("PSA", "7.2"),))
    contexto = solicitud["clinicalContext"]
    contexto["diagnosis"]["cancerType"] = "prostata"
    contexto[
        "missingCriticalData"
    ] = []  # las claves de mama no son del catálogo de próstata (RN-11)
    contexto["diagnosis"]["grade"] = "Gleason 4+3=7 · ISUP 3"

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 200
    esperada = f"{Q_GENERICA} Cáncer de próstata IIB ISUP 3 Antígeno prostático específico (PSA)"
    assert entorno.reranker.preguntas == [Q_GENERICA, esperada]
    assert expansion_de(respuesta.json()) == {"applied": True, "fields": CAMPOS_USADOS}


@pytest.mark.ac("US-271", 2)
@pytest.mark.parametrize(
    "pregunta",
    [p["pregunta"] for p in preguntas_de_la_medicion() if p["clase"] == "con_tema"],
    ids=[p["id"] for p in preguntas_de_la_medicion() if p["clase"] == "con_tema"],
)
def test_rag_query_sigue_sin_evidencia_sin_loop_contextual_cuando_la_pregunta_tiene_tema_propio(
    pregunta,
):
    entorno = crear_entorno_contextual()

    respuesta = entorno.consultar(solicitud_contextual(pregunta))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["topRelevanceScore"] is None
    assert entorno.generador.invocaciones == 0
    assert entorno.reranker.preguntas == [pregunta]  # solo el primer loop
    assert "contextExpansion" not in cuerpo["meta"]["retrievalParams"]


@pytest.mark.ac("US-271", 3)
def test_rag_query_responde_sin_evidencia_con_score_null_cuando_el_loop_contextual_tampoco_supera_el_umbral():
    entorno = crear_entorno_contextual(puntajes=puntajes_contextuales(consulta_contextual={}))

    respuesta = entorno.consultar(solicitud_contextual())

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["topRelevanceScore"] is None
    assert cuerpo["evidenceOptions"] == []
    assert entorno.generador.invocaciones == 0
    assert entorno.reranker.preguntas == [Q_GENERICA, CONSULTA_CONTEXTUAL]
    assert expansion_de(cuerpo) == {"applied": True, "fields": CAMPOS_USADOS}
    assert _reescritura(cuerpo) == {"applied": False, "reason": "no_disparado"}


@pytest.mark.ac("US-271", 4)
def test_rag_query_responde_igual_byte_a_byte_cuando_el_primer_loop_supera_el_umbral_con_o_sin_indicador():
    encendido = crear_entorno_contextual(habilitada=True)
    apagado = crear_entorno_contextual(habilitada=False)

    con_indicador = encendido.consultar(solicitud_contextual(Q_HER2))
    sin_indicador = apagado.consultar(solicitud_contextual(Q_HER2))

    assert con_indicador.status_code == sin_indicador.status_code == 200
    assert con_indicador.content == sin_indicador.content
    assert len(encendido.reranker.preguntas) == 1  # sin segundo loop
    assert "contextExpansion" not in con_indicador.json()["meta"]["retrievalParams"]
    assert _reescritura(con_indicador.json()) == {"applied": False, "reason": "no_disparado"}


@pytest.mark.ac("US-271", 5)
def test_rag_query_no_invoca_la_reescritura_cuando_el_loop_contextual_corre_aunque_este_habilitada():
    reescritor = ReescritorFalso()
    entorno = crear_entorno_contextual(
        parametros=parametros_contextuales(reescritura=CON_REESCRITURA), reescritor=reescritor
    )

    respuesta = entorno.consultar(solicitud_contextual(biomarcadores=()))

    assert respuesta.status_code == 200
    assert reescritor.invocaciones == 0
    assert (
        len(entorno.reranker.preguntas) == 2
    )  # el primer loop y un solo segundo loop (el contextual)


def test_rag_query_sigue_usando_la_reescritura_cuando_la_pregunta_tiene_tema_propio_y_el_primer_loop_esta_vacio():
    reescritor = ReescritorFalso()
    entorno = crear_entorno_contextual(
        parametros=replace(
            parametros_de_reescritura(),
            expansion_contextual=parametros_contextuales().expansion_contextual,
        ),
        embedder=EmbedderDeReescritura(),
        reranker=RerankerFalso(PUNTAJES_DE_REESCRITURA),
        reescritor=reescritor,
        terminos_del_catalogo=CATALOGO_DE_PRUEBA,
    )

    respuesta = entorno.consultar(solicitud_contextual(Q_TYPO))

    cuerpo = respuesta.json()
    assert reescritor.invocaciones == 1
    assert _reescritura(cuerpo) == {"applied": True, "reason": "disparado"}
    assert "contextExpansion" not in cuerpo["meta"]["retrievalParams"]


@pytest.mark.ac("US-271", 6)
def test_rag_query_envia_solo_terminos_del_catalogo_y_no_registra_valores_cuando_hay_texto_libre_sembrado(
    caplog,
):
    caplog.set_level(logging.DEBUG)
    entorno = crear_entorno_contextual()
    solicitud = solicitud_contextual(biomarcadores=(("HER2", "SENTINELA-VALOR-LIBRE"),))
    pseudo = solicitud["clinicalContext"]["pseudoPatientId"]
    contexto = solicitud["clinicalContext"]
    contexto["diagnosis"]["histology"] = "SENTINELA-HISTOLOGIA"
    contexto["events"][0]["description"] = (
        "SENTINELA-EVENTO seudónimo X 2026-01-02 Nombre Sintético"
    )

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 200
    # Lo que añade el loop contextual: la consulta que se embebe y la que puntúa el reranker (el resumen del contexto que
    # ya se embebía en el primer loop es anterior a este cambio y no lleva la pregunta).
    enviado = " ".join(
        [
            *entorno.reranker.preguntas,
            *(t for t in entorno.embedder.textos if t.startswith(Q_GENERICA)),
        ]
    )
    assert entorno.reranker.preguntas[-1] == f"{Q_GENERICA} Cáncer de mama IIA HER2"
    for ajeno in ("SENTINELA", "seudónimo", "2026-01-02", "Nombre Sintético", pseudo):
        assert ajeno not in enviado
        assert ajeno not in caplog.text
    registro = next(
        r.getMessage()
        for r in caplog.records
        if "event=rag_query_expansion_contextual" in r.getMessage()
    )
    assert "fields=tipo,estadio,biomarcador_principal" in registro
    assert "terms=3" in registro
    assert "traceId=" in registro
    assert "IIA" not in registro and "Cáncer de mama" not in registro


def test_rag_query_no_hace_segunda_busqueda_cuando_ningun_termino_del_caso_esta_en_el_catalogo():
    catalogo_vacio = CatalogoDeTerminos(
        etiqueta_de_tipo={}, estadios={}, grados={}, biomarcadores={}
    )
    entorno = crear_entorno_contextual(catalogo_de_terminos=catalogo_vacio)

    respuesta = entorno.consultar(solicitud_contextual())

    cuerpo = respuesta.json()
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["topRelevanceScore"] is None
    assert entorno.buscador.invocaciones == 2  # solo el primer loop: pregunta y resumen
    assert entorno.reranker.preguntas == [Q_GENERICA]
    assert "contextExpansion" not in cuerpo["meta"]["retrievalParams"]
    assert _reescritura(cuerpo) == {"applied": False, "reason": "no_disparado"}


@pytest.mark.ac("US-271", 7)
def test_rag_query_no_dispara_el_loop_y_no_declara_contextexpansion_cuando_el_indicador_esta_apagado_por_defecto():
    assert settings_de_prueba().query_context_expansion_enabled is False
    entorno = crear_entorno_contextual(habilitada=False)

    respuesta = entorno.consultar(solicitud_contextual())

    cuerpo = json.loads(respuesta.text)
    assert cuerpo["status"] == "sin_evidencia"
    assert entorno.reranker.preguntas == [Q_GENERICA]
    assert "contextExpansion" not in cuerpo["meta"]["retrievalParams"]
    assert _reescritura(cuerpo) == {"applied": False, "reason": "no_disparado"}


@pytest.mark.ac("US-271", 7)
def test_rag_query_declara_contextexpansion_igual_que_el_ejemplo_del_contrato_cuando_corre_el_loop():
    entorno = crear_entorno_contextual()
    ejemplo = json.loads((EJEMPLOS / "rag-query-contextual.json").read_text("utf-8"))

    respuesta = entorno.consultar(solicitud_contextual())

    assert expansion_de(respuesta.json()) == expansion_de(ejemplo)
    assert _reescritura(respuesta.json()) == _reescritura(ejemplo)


@pytest.mark.parametrize(
    ("variable", "valor"),
    [
        ("query_context_expansion_fields", "tipo,nombre_del_paciente"),
        ("query_context_expansion_fields", "tipo,tipo"),
        ("query_context_expansion_fields", ""),
        ("query_context_expansion_rerank_format", "SENTINELA-FORMATO"),
    ],
)
def test_arranque_falla_nombrando_la_variable_y_no_el_valor_cuando_la_configuracion_contextual_es_invalida(
    variable, valor
):
    with pytest.raises(ValidationError) as error:
        settings_de_prueba(**{variable: valor})

    eventos = describir_errores(error.value)
    assert [e["variable"] for e in eventos] == [variable.upper()]
    assert "SENTINELA" not in json.dumps(eventos) and "nombre_del_paciente" not in json.dumps(
        eventos
    )
