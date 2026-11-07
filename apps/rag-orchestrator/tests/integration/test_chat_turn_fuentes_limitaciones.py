"""`POST /chat/turn`, fuentes y limitaciones (US-266 / L1D-323): RN-02, RN-04, RN-25, AC-T1.3, AC-06.2, FR-10.

El ``ChatTurnService`` y el servicio de `/rag/query` son los de producción; el LLM del chat, el generador de opciones, el
NLI, el reranker, Milvus, el catálogo del corpus y las posiciones de los chunks son falsos. El nodo de fuentes y
limitaciones es determinista: ningún test lo hace pasar por el LLM. Cada respuesta se valida contra el spec del proveedor
(US-214). Solo datos sintéticos.
"""

import json
import re
from dataclasses import replace
from datetime import date
from pathlib import Path

import pytest

from app.application.ports import ReleaseDelCorpus
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from tests.support.aplicabilidad import (
    CORPUS_FX08BA,
    RAZON_E_SIN_SOPORTE,
    entorno_fx10ca,
    solicitud_a_m1,
)
from tests.support.chat import ESTADO_VACIO, Q_FALTANTES, solicitud_desde_ejemplo
from tests.support.chat_evidencia import (
    crear_entorno_de_chat_con_evidencia,
    entorno_de_seguimiento,
    solicitud_de_evidencia,
)
from tests.support.fakes import settings_de_prueba
from tests.support.generador_falso import FakeEvidenceGenerator
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso
from tests.support.recuperacion import (
    CORPUS_FX06A,
    EJEMPLOS,
    FICHAS_FX06A,
    Q_HER2,
    Q_SIN,
    CatalogoFalso,
    LectorReleaseFalso,
    crear_entorno,
)
from tests.support.posiciones_falsas import PosicionesFalsas

Q_FUENTES = "¿Cuáles son las fuentes y las limitaciones?"
LISTA_RN23 = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "clinical-catalogs"
    / "lenguaje"
    / "terminos-prohibidos.json"
)
FRASE_FR10 = "La evidencia encontrada no permite establecer por sí sola la aplicabilidad de un tratamiento a este paciente"
SIN_CONSULTA = "Aún no se ha consultado evidencia en esta conversación"
FUENTE_M1 = (
    "Fuente: Breast Cancer Treatment (test). Nombre de la fuente: NCI PDQ. Año de publicación: 2025. "
    "Idioma: en. Licencia: dominio_publico."
)
RECUPERACION_FX06A = (
    "Alcance de la recuperación: el corpus tiene fecha de corte 2026-09-30; fuentes no incluidas: NCCN, ESMO; "
    "fragmentos evaluados por el reranker en la última consulta de evidencia: 2."
)
LIMITACIONES_SIN_CRITERIOS = (
    "Limitaciones de la evidencia: ningún criterio de aplicabilidad quedó en estado Desconocido; "
    f"opciones descartadas por falta de soporte: 0. {FRASE_FR10}."
)
AVISOS = [
    settings_de_prueba().chat_notice_ai,
    settings_de_prueba().chat_notice_academic,
]


def _cuerpo_200(respuesta) -> dict:
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def _kinds_y_textos(cuerpo):
    return [(b["kind"], b["text"]) for b in cuerpo["blocks"]]


def _analisis_y_fuentes(entorno, pregunta: str = Q_FUENTES):
    primero = entorno.turno(solicitud_de_evidencia(Q_HER2))
    assert primero.status_code == 200 and "evidenceAnalysis" in primero.json()
    return entorno.turno(solicitud_de_evidencia(pregunta, rehidratacion=None))


def _rehidratacion(*, chunk_ids: list[str], citas: list[str]) -> dict:
    """Un hilo reconstruido por Backend 1: ``structuredState`` con la última evidencia (sin ``analysisId``) y sus citas."""
    estado = {
        **ESTADO_VACIO,
        "intentsVistos": ["evidencia"],
        "preguntasPrevias": [Q_HER2],
        "citasMostradas": citas,
        "ultimaEvidencia": {"query": Q_HER2, "chunkIds": chunk_ids, "topRelevanceScore": 0.87},
    }
    return {
        "turns": [
            {
                "question": Q_HER2,
                "intent": "evidencia",
                "blocksText": ["Opciones descritas en la evidencia: opción 1 de 1."],
                "factRefs": [],
            }
        ],
        "structuredState": estado,
    }


@pytest.mark.ac("US-266", 1)
def test_chat_turn_lista_un_bloque_fuente_por_documento_citado_sin_llamar_al_llm_cuando_se_pregunta_por_las_fuentes():
    entorno, _ = entorno_de_seguimiento("SEG-OK")

    respuesta = _analisis_y_fuentes(entorno)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == "fuentes_limitaciones"
    assert entorno.llm.invocaciones == 0  # ni generación ni clasificación
    fuentes = [b for b in cuerpo["blocks"] if b["kind"] == "fuente"]
    assert [f["text"] for f in fuentes] == [FUENTE_M1]
    ficha = FICHAS_FX06A["doc-m1"]
    assert all(
        valor in fuentes[0]["text"]
        for valor in (ficha.title, ficha.source_name, "2025", ficha.language, ficha.license_class)
    )
    assert all("chunkId" not in f and "citations" not in f for f in fuentes)
    assert cuerpo["notices"] == AVISOS
    assert "evidenceAnalysis" not in cuerpo


@pytest.mark.ac("US-266", 2)
def test_chat_turn_muestra_no_disponible_en_el_anio_cuando_el_documento_no_tiene_fecha_de_publicacion():
    sin_fecha = {**FICHAS_FX06A, "doc-m1": replace(FICHAS_FX06A["doc-m1"], published_at=None)}
    entorno, _ = entorno_de_seguimiento("SEG-OK", catalogo=CatalogoFalso(fichas=sin_fecha))

    cuerpo = _cuerpo_200(_analisis_y_fuentes(entorno))

    (fuente,) = [b["text"] for b in cuerpo["blocks"] if b["kind"] == "fuente"]
    assert "Año de publicación: No disponible." in fuente
    assert re.search(r"\d", fuente) is None  # ni 0 ni otro año en lugar del ausente


@pytest.mark.ac("US-266", 3)
def test_chat_turn_declara_el_corte_las_fuentes_no_incluidas_y_los_fragmentos_evaluados_cuando_se_pregunta_por_las_limitaciones():
    entorno = crear_entorno_de_chat_con_evidencia(crear_entorno())
    ids = ["ch-m1-1", *(f"ch-x-{n}" for n in range(40))]
    rehidratacion = _rehidratacion(chunk_ids=ids, citas=["ch-m1-1"])

    respuesta = entorno.turno(solicitud_de_evidencia(Q_FUENTES, rehidratacion=rehidratacion))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    limitaciones = [b["text"] for b in cuerpo["blocks"] if b["kind"] == "limitacion"]
    assert limitaciones[0] == (
        "Alcance de la recuperación: el corpus tiene fecha de corte 2026-09-30; fuentes no incluidas: NCCN, ESMO; "
        "fragmentos evaluados por el reranker en la última consulta de evidencia: 41."
    )
    # Solo el nombre de las fuentes excluidas: ningún otro bloque las menciona.
    assert all("NCCN" not in b["text"] for b in cuerpo["blocks"] if b["text"] != limitaciones[0])


@pytest.mark.ac("US-266", 4)
def test_chat_turn_nombra_los_criterios_desconocidos_y_las_opciones_descartadas_sin_terminos_prohibidos_cuando_el_hilo_sigue_vivo():
    nli = NliFalso(resultados={RAZON_E_SIN_SOPORTE: NEUTRAL}, por_defecto=IMPLICA)
    base = entorno_fx10ca("LLM-CUATRO", clasificador_nli=nli)
    entorno = crear_entorno_de_chat_con_evidencia(base, corpus=CORPUS_FX08BA)
    contexto = solicitud_a_m1()["clinicalContext"]
    version = base.catalogo_clinico.version()
    primero = entorno.turno(
        solicitud_de_evidencia(Q_HER2, contexto_clinico=contexto, version_del_catalogo=version)
    )
    assert len(primero.json()["evidenceAnalysis"]["discardedOptions"]) == 1

    respuesta = entorno.turno(
        solicitud_de_evidencia(
            Q_FUENTES, contexto_clinico=contexto, version_del_catalogo=version, rehidratacion=None
        )
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == "fuentes_limitaciones"
    texto = next(
        b["text"]
        for b in cuerpo["blocks"]
        if b["kind"] == "limitacion" and b["text"].startswith("Limitaciones de la evidencia")
    )
    assert "estado menopausico" in texto
    assert "opciones descartadas por falta de soporte: 1" in texto
    assert FRASE_FR10 in texto
    lista = ListaTerminos.model_validate_json(LISTA_RN23.read_text(encoding="utf-8"))
    for bloque in cuerpo["blocks"]:
        assert (
            check_prohibited_terms(bloque["text"], lista, niveles=("A", "B"), permitir_frases=False)
            == []
        )


@pytest.mark.ac("US-266", 4)
def test_chat_turn_remite_al_analisis_registrado_sin_inventar_valores_cuando_el_hilo_fue_rehidratado():
    entorno = crear_entorno_de_chat_con_evidencia(crear_entorno())
    rehidratacion = _rehidratacion(chunk_ids=["ch-m1-1", "ch-inj-1"], citas=["ch-m1-1"])

    cuerpo = _cuerpo_200(
        entorno.turno(solicitud_de_evidencia(Q_FUENTES, rehidratacion=rehidratacion))
    )

    texto = next(
        b["text"]
        for b in cuerpo["blocks"]
        if b["kind"] == "limitacion" and b["text"].startswith("Limitaciones de la evidencia")
    )
    assert "análisis registrado de esta conversación" in texto
    assert FRASE_FR10 in texto
    assert "Desconocido:" not in texto and "opciones descartadas por falta de soporte" not in texto


def test_chat_turn_responde_con_los_bloques_del_ejemplo_cuando_el_hilo_tiene_un_analisis_vivo():
    entorno, _ = entorno_de_seguimiento("SEG-OK")
    assert entorno.turno(solicitud_de_evidencia(Q_HER2)).status_code == 200

    cuerpo = _cuerpo_200(entorno.turno(solicitud_de_evidencia(Q_FUENTES, rehidratacion=None)))

    assert _kinds_y_textos(cuerpo) == [
        ("fuente", FUENTE_M1),
        ("limitacion", RECUPERACION_FX06A),
        ("limitacion", LIMITACIONES_SIN_CRITERIOS),
    ]


@pytest.mark.ac("US-266", 6)
def test_chat_turn_dice_que_aun_no_se_consulto_evidencia_sin_fuentes_ni_llm_cuando_el_hilo_no_tiene_ultima_evidencia():
    entorno, _ = entorno_de_seguimiento("SEG-OK")
    previo = entorno.turno(solicitud_de_evidencia(Q_FALTANTES))
    assert previo.status_code == 200 and previo.json()["intent"] == "faltantes"

    respuesta = entorno.turno(solicitud_de_evidencia(Q_FUENTES, rehidratacion=None))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == "fuentes_limitaciones"
    assert _kinds_y_textos(cuerpo) == [("limitacion", SIN_CONSULTA)]
    assert not any("citations" in b for b in cuerpo["blocks"])
    assert entorno.llm.invocaciones == 0


def test_chat_turn_no_cita_ninguna_fuente_pero_declara_la_recuperacion_cuando_la_ultima_consulta_no_cito_nada():
    entorno = crear_entorno_de_chat_con_evidencia(crear_entorno())
    rehidratacion = _rehidratacion(chunk_ids=["ch-m1-1", "ch-inj-1"], citas=[])

    cuerpo = _cuerpo_200(
        entorno.turno(solicitud_de_evidencia(Q_FUENTES, rehidratacion=rehidratacion))
    )

    assert not [b for b in cuerpo["blocks"] if b["kind"] == "fuente"]
    assert cuerpo["blocks"][0]["kind"] == "limitacion"
    assert "no citó ninguna fuente" in cuerpo["blocks"][0]["text"]


@pytest.mark.ac("US-266", 5)
def test_chat_turn_dice_sin_evidencia_con_las_limitaciones_de_la_recuperacion_y_sin_llamar_al_llm_cuando_ningun_chunk_supera_el_umbral():
    base = crear_entorno(generador=FakeEvidenceGenerator("LLM-OK"))
    entorno = crear_entorno_de_chat_con_evidencia(base)

    respuesta = entorno.turno(solicitud_de_evidencia(Q_SIN))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == "evidencia"
    assert cuerpo["evidenceAnalysis"]["status"] == "sin_evidencia"
    ultima = cuerpo["structuredState"]["ultimaEvidencia"]
    assert ultima["topRelevanceScore"] is None and ultima["topRelevanceScore"] != 0.0
    assert base.generador.invocaciones == 0  # type: ignore[attr-defined]
    assert entorno.llm.invocaciones == 0
    evaluados = len(ultima["chunkIds"])
    assert _kinds_y_textos(cuerpo) == [
        ("limitacion", "Ningún fragmento recuperado supera el umbral de relevancia."),
        (
            "limitacion",
            "Alcance de la recuperación: el corpus tiene fecha de corte 2026-09-30; fuentes no incluidas: NCCN, ESMO; "
            f"fragmentos evaluados por el reranker en la última consulta de evidencia: {evaluados}.",
        ),
    ]
    assert cuerpo["notices"] == AVISOS


RELEASE_SINTETICO = ReleaseDelCorpus(
    release_id="rel-test-1",
    cutoff_date=date(2026, 9, 30),
    excluded_sources=("FUENTE-EXCLUIDA-1", "FUENTE-EXCLUIDA-2"),
)


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    ("ejemplo", "sin_fecha"),
    [("chat-turn-fuentes-ok.json", False), ("chat-turn-fuentes-sin-anio.json", True)],
)
def test_chat_turn_produce_los_ejemplos_de_fuentes_cuando_recibe_sus_peticiones_de_ejemplo(
    ejemplo, sin_fecha
):
    fichas = (
        {**FICHAS_FX06A, "doc-m1": replace(FICHAS_FX06A["doc-m1"], published_at=None)}
        if sin_fecha
        else FICHAS_FX06A
    )
    entorno, _ = entorno_de_seguimiento(
        "SEG-OK",
        lector_release=LectorReleaseFalso(RELEASE_SINTETICO),
        catalogo=CatalogoFalso(fichas=fichas),
    )

    primero = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-evidencia.json"))
    segundo = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-fuentes.json"))

    assert primero.status_code == segundo.status_code == 200
    assert segundo.json() == _ejemplo(ejemplo)


def test_chat_turn_produce_el_ejemplo_sin_consulta_cuando_el_hilo_no_tiene_evidencia():
    entorno, _ = entorno_de_seguimiento(
        "SEG-OK", lector_release=LectorReleaseFalso(RELEASE_SINTETICO)
    )

    respuesta = entorno.turno(
        solicitud_desde_ejemplo("chat-turn-request-fuentes-sin-consulta.json")
    )

    assert respuesta.status_code == 200
    assert respuesta.json() == _ejemplo("chat-turn-fuentes-sin-consulta.json")


def test_chat_turn_produce_el_ejemplo_sin_evidencia_cuando_la_pregunta_no_supera_el_umbral():
    entorno = crear_entorno_de_chat_con_evidencia(
        crear_entorno(
            generador=FakeEvidenceGenerator("LLM-OK"),
            lector_release=LectorReleaseFalso(RELEASE_SINTETICO),
        )
    )

    respuesta = entorno.turno(
        solicitud_desde_ejemplo("chat-turn-request-fuentes-sin-evidencia.json")
    )

    assert respuesta.status_code == 200
    assert respuesta.json() == _ejemplo("chat-turn-fuentes-sin-evidencia.json")


def _hilo_rehidratado_con_una_cita() -> dict:
    return _rehidratacion(chunk_ids=["ch-m1-1", "ch-inj-1"], citas=["ch-m1-1"])


@pytest.mark.parametrize(
    "falla",
    ["catalogo", "release", "posiciones"],
)
def test_chat_turn_responde_503_retrieval_unavailable_sin_detalle_cuando_falla_un_borde_del_corpus(
    falla,
):
    error = RuntimeError("SINT-detalle-interno-del-borde")
    base = crear_entorno(
        catalogo=CatalogoFalso(error=error if falla == "catalogo" else None),
        lector_release=LectorReleaseFalso(error=error if falla == "release" else None),
    )
    posiciones = PosicionesFalsas(CORPUS_FX06A, error=error if falla == "posiciones" else None)
    entorno = crear_entorno_de_chat_con_evidencia(base, posiciones=posiciones)

    respuesta = entorno.turno(
        solicitud_de_evidencia(Q_FUENTES, rehidratacion=_hilo_rehidratado_con_una_cita())
    )

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "RETRIEVAL_UNAVAILABLE"
    assert "SINT-detalle" not in respuesta.text
    assert entorno.llm.invocaciones == 0


def test_chat_turn_no_lista_un_documento_ni_lo_inventa_cuando_el_chunk_citado_ya_no_esta_vigente():
    entorno = crear_entorno_de_chat_con_evidencia(crear_entorno())
    rehidratacion = _rehidratacion(chunk_ids=["ch-m1v0-1"], citas=["ch-m1v0-1"])

    cuerpo = _cuerpo_200(
        entorno.turno(solicitud_de_evidencia(Q_FUENTES, rehidratacion=rehidratacion))
    )

    assert not [b for b in cuerpo["blocks"] if b["kind"] == "fuente"]
    assert "no citó ninguna fuente" in cuerpo["blocks"][0]["text"]


def test_chat_turn_no_pasa_un_analisis_previo_como_cita_ni_como_soporte_cuando_se_pregunta_por_las_fuentes():
    entorno, _ = entorno_de_seguimiento("SEG-OK")

    cuerpo = _cuerpo_200(_analisis_y_fuentes(entorno))

    assert all("citations" not in b and "factRefs" not in b for b in cuerpo["blocks"])
    assert cuerpo["omittedClaims"] == 0
    # El turno no recupera: su estado conserva la última evidencia del análisis y no suma citas nuevas.
    assert cuerpo["structuredState"]["citasMostradas"] == ["ch-m1-1"]
