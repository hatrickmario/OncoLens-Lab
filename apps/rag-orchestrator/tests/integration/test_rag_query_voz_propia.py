"""`POST /rag/query` y la voz propia de recomendación (US-249 AC-1, AC-2; RN-23, RN-04, RN-25).

El filtro de producción rechaza el Nivel A 1.6.0 (condicional, impersonal con «se», imperativo) y el subconjunto
``salidaGenerada.nivelB`` (la recomendación atribuida), salvo una cita textual atribuida («Según ‹fuente›: «…»») que
aparece literalmente en un fragmento que la MISMA opción cita. Generador y NLI falsos en su puerto; cada respuesta se
valida contra el spec del proveedor (hook de ``verificacion_proveedor.py``, US-214).
"""

from __future__ import annotations

import logging
from typing import Any

import pytest

from app.application.ports import EvidenciaGenerada, ResultadoDeRecuperacion
from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from app.domain.support import RETIRO_ES
from app.schemas.generated.models import RagQueryInternalRequest
from tests.support.contract import CATALOGOS
from tests.support.nli_falso import IMPLICA, NliFalso
from tests.support.opcion_generada import opcion_atomica, opcion_con_afirmaciones
from tests.support.recuperacion import (
    CORPUS_FX06A,
    FICHAS_FX06A,
    PUNTAJES_FX06A,
    Q_HER2,
    BuscadorFalso,
    CatalogoFalso,
    ChunkFx,
    RerankerFalso,
    _vector,
    crear_entorno,
    solicitud_de,
)

LISTA = ListaTerminos.model_validate_json(
    (CATALOGOS / "lenguaje" / "terminos-prohibidos.json").read_text(encoding="utf-8")
)
OPCION = "Quimioterapia adyuvante combinada con terapia dirigida anti-HER2"
TITULO = FICHAS_FX06A["doc-m1"].title
CITA_G1 = "The guideline recommends adding anti-HER2 therapy to adjuvant chemotherapy"
CH_G1 = ChunkFx("ch-g1-1", "doc-m1", f"{CITA_G1}.", _vector(e0=0.8, e3=0.2), True, "mama")
CH_G1_AJENO = ChunkFx("ch-g1-2", "doc-m1", f"{CITA_G1}.", _vector(e0=0.7, e3=0.3), True, "mama")
CH_DEBE = ChunkFx(
    "ch-g1-3", "doc-m1", "The patient debe recibir the combination.", _vector(e0=0.6), True, "mama"
)
CH_RECOMIENDA = ChunkFx(
    "ch-g1-4",
    "doc-m1",
    "La guía recomienda añadir terapia anti-HER2.",
    _vector(e0=0.5),
    True,
    "mama",
)
CHUNKS = (*CORPUS_FX06A, CH_G1, CH_G1_AJENO, CH_DEBE, CH_RECOMIENDA)
PUNTAJES = {
    Q_HER2: {
        **PUNTAJES_FX06A[Q_HER2],
        "ch-g1-1": 0.86,
        "ch-g1-2": 0.85,
        "ch-g1-3": 0.84,
        "ch-g1-4": 0.83,
    }
}


class GeneradorDeGuion:
    """``EvidenceGenerator`` que entrega la opción guionada tal cual: el borde fingido del LLM (nunca el real)."""

    def __init__(self, *opciones, limitaciones: tuple[str, ...] = ()) -> None:
        self._evidencia = EvidenciaGenerada(
            opciones=tuple(opciones), limitaciones_propuestas=limitaciones
        )

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada:
        return self._evidencia


def _consultar(generador: GeneradorDeGuion) -> Any:
    entorno = crear_entorno(
        generador=generador,
        clasificador_nli=NliFalso(por_defecto=IMPLICA),
        buscador=BuscadorFalso(chunks=CHUNKS),
        reranker=RerankerFalso(puntajes=PUNTAJES),
        catalogo=CatalogoFalso(),
    )
    respuesta = entorno.consultar(solicitud_de(Q_HER2))
    assert respuesta.status_code == 200
    return respuesta.json()


def _con_razon(razon: str, citas: tuple[str, ...] = ("ch-g1-1",)) -> GeneradorDeGuion:
    return GeneradorDeGuion(opcion_atomica(OPCION, razon, citas))


def _atribuida(cita: str) -> str:
    return f'Según {TITULO}: "{cita}"'


def _descartada_por_lenguaje(cuerpo: dict) -> dict:
    assert cuerpo["evidenceOptions"] == []
    (descartada,) = cuerpo["discardedOptions"]
    assert descartada["discardReason"] == "lenguaje_no_permitido"
    return descartada


def _eventos_de_retiro(caplog: pytest.LogCaptureFixture) -> list[str]:
    return [
        r.getMessage()
        for r in caplog.records
        if "event=fragmento_retirado_lenguaje" in r.getMessage()
    ]


# --- AC-1: voz propia en el Nivel A ----------------------------------------------------------------------------


@pytest.mark.ac("US-249", 1)
def test_rag_query_descarta_la_opcion_con_lenguaje_no_permitido_cuando_la_justificacion_dice_se_recomendaria_iniciar():
    cuerpo = _consultar(_con_razon("Se recomendaría iniciar trastuzumab adyuvante", ("ch-m1-1",)))

    descartada = _descartada_por_lenguaje(cuerpo)
    assert RETIRO_ES in descartada["rationale"]
    assert "recomendaría" not in descartada["rationale"]
    generados = [descartada["option"], descartada["rationale"]]
    assert [c for t in generados for c in check_prohibited_terms(t, LISTA)] == []


@pytest.mark.ac("US-249", 1)
@pytest.mark.parametrize(
    "frase", ["Se aconseja administrar dos ciclos", "Considere iniciar hormonoterapia"]
)
def test_rag_query_descarta_la_opcion_con_lenguaje_no_permitido_cuando_una_afirmacion_secundaria_esta_en_voz_propia(
    frase: str,
):
    opcion = opcion_con_afirmaciones(
        OPCION,
        (
            AfirmacionAtomica(
                "La evidencia describe la adición de terapia anti-HER2.",
                PapelDeAfirmacion.principal,
                ("ch-m1-1",),
            ),
            AfirmacionAtomica(frase, PapelDeAfirmacion.secundaria, ("ch-m1-1",)),
        ),
    )

    cuerpo = _consultar(GeneradorDeGuion(opcion))

    _descartada_por_lenguaje(cuerpo)
    assert frase not in str(cuerpo)


@pytest.mark.ac("US-249", 1)
def test_rag_query_omite_la_limitacion_y_cuenta_cuando_esta_en_voz_propia():
    generador = GeneradorDeGuion(
        opcion_atomica(
            OPCION, "La evidencia describe la adición de terapia anti-HER2.", ("ch-m1-1",)
        ),
        limitaciones=("No se aconseja en mayores de 70 años",),
    )

    cuerpo = _consultar(generador)

    assert cuerpo["limitations"] == []
    assert cuerpo["omittedClaims"] == 1


@pytest.mark.ac("US-249", 1)
def test_rag_query_registra_la_regla_y_la_version_1_6_0_sin_el_texto_cuando_retira_la_voz_propia(
    caplog: pytest.LogCaptureFixture,
):
    caplog.set_level(logging.INFO)

    _consultar(_con_razon("Se recomendaría iniciar trastuzumab adyuvante", ("ch-m1-1",)))

    (evento,) = _eventos_de_retiro(caplog)
    assert "ruleId=es-se-recomendaria" in evento
    assert "languagePolicyVersion=1.6.0" in evento
    todo = "\n".join(r.getMessage() for r in caplog.records)
    assert "Se recomendaría" not in todo and "trastuzumab" not in todo


# --- AC-2: recomendación atribuida (subconjunto del Nivel B) ---------------------------------------------------


@pytest.mark.ac("US-249", 2)
def test_rag_query_rechaza_con_b_recommend_cuando_la_justificacion_atribuye_la_recomendacion_sin_comillas(
    caplog: pytest.LogCaptureFixture,
):
    caplog.set_level(logging.INFO)

    cuerpo = _consultar(_con_razon(f"{CITA_G1} for HER2-positive early breast cancer"))

    _descartada_por_lenguaje(cuerpo)
    (evento,) = _eventos_de_retiro(caplog)
    assert "campo=rationale" in evento and "ruleId=b-recommend" in evento


@pytest.mark.ac("US-249", 2)
def test_rag_query_rechaza_con_b_recomiend_cuando_la_forma_espanola_atribuida_cita_un_fragmento_que_la_contiene(
    caplog: pytest.LogCaptureFixture,
):
    caplog.set_level(logging.INFO)

    cuerpo = _consultar(_con_razon("La guía recomienda añadir terapia anti-HER2", ("ch-g1-4",)))

    _descartada_por_lenguaje(cuerpo)
    assert "ruleId=b-recomiend" in _eventos_de_retiro(caplog)[0]


@pytest.mark.ac("US-249", 2)
def test_rag_query_conserva_la_opcion_cuando_la_cita_textual_atribuida_es_literal_del_fragmento_citado():
    cuerpo = _consultar(_con_razon(_atribuida(CITA_G1)))

    assert cuerpo["discardedOptions"] == []
    (opcion,) = cuerpo["evidenceOptions"]
    assert CITA_G1 in opcion["rationale"]


def test_rag_query_rechaza_la_cita_atribuida_cuando_no_esta_en_ningun_fragmento_que_la_opcion_cita():
    # ch-g1-2 trae la misma frase y se recuperó, pero la opción solo cita ch-m1-1.
    cuerpo = _consultar(_con_razon(_atribuida(CITA_G1), ("ch-m1-1",)))

    _descartada_por_lenguaje(cuerpo)


def test_rag_query_rechaza_la_cita_atribuida_cuando_el_titulo_no_es_el_del_catalogo():
    cuerpo = _consultar(_con_razon(f'Según otra guía: "{CITA_G1}"'))

    _descartada_por_lenguaje(cuerpo)


def test_rag_query_rechaza_la_cita_cuando_el_tramo_no_es_literal_del_fragmento():
    cuerpo = _consultar(_con_razon(_atribuida("The guideline recommends adding anti-HER2 therapy")))
    assert cuerpo["evidenceOptions"], "un tramo literal sí está en el fragmento"

    cuerpo = _consultar(
        _con_razon(_atribuida("The guideline recommends stopping anti-HER2 therapy"))
    )
    _descartada_por_lenguaje(cuerpo)


@pytest.mark.ac("US-249", 2)
def test_rag_query_rechaza_con_b_recommend_cuando_la_cita_entre_comillas_no_trae_la_atribucion(
    caplog: pytest.LogCaptureFixture,
):
    caplog.set_level(logging.INFO)

    cuerpo = _consultar(_con_razon(f'The source reports that the statement reads: "{CITA_G1}"'))

    _descartada_por_lenguaje(cuerpo)
    assert "ruleId=b-recommend" in _eventos_de_retiro(caplog)[0]


@pytest.mark.ac("US-249", 2)
def test_rag_query_rechaza_cuando_la_cita_textual_atribuida_trae_un_termino_del_nivel_a():
    cuerpo = _consultar(
        _con_razon(_atribuida("The patient debe recibir the combination"), ("ch-g1-3",))
    )

    _descartada_por_lenguaje(cuerpo)


@pytest.mark.ac("US-249", 2)
def test_rag_query_no_aplica_el_resto_del_nivel_b_cuando_la_justificacion_es_descriptiva():
    razon = "Los ensayos evaluaron administrar trastuzumab durante un año"

    cuerpo = _consultar(_con_razon(razon, ("ch-m1-1",)))

    assert cuerpo["discardedOptions"] == []
    assert len(cuerpo["evidenceOptions"]) == 1


@pytest.mark.ac("US-249", 2)
def test_rag_query_conserva_la_limitacion_cuando_la_cita_atribuida_es_literal_de_un_fragmento_entregado():
    generador = GeneradorDeGuion(
        opcion_atomica(
            OPCION, "La evidencia describe la adición de terapia anti-HER2.", ("ch-m1-1",)
        ),
        limitaciones=(_atribuida(CITA_G1),),
    )

    cuerpo = _consultar(generador)

    assert [limitacion["text"] for limitacion in cuerpo["limitations"]] == [_atribuida(CITA_G1)]
    assert cuerpo["omittedClaims"] == 0


@pytest.mark.ac("US-249", 2)
def test_rag_query_omite_la_limitacion_y_cuenta_cuando_la_cita_entre_comillas_no_trae_la_atribucion():
    generador = GeneradorDeGuion(
        opcion_atomica(
            OPCION, "La evidencia describe la adición de terapia anti-HER2.", ("ch-m1-1",)
        ),
        limitaciones=(f'The statement reads: "{CITA_G1}"',),
    )

    cuerpo = _consultar(generador)

    assert cuerpo["limitations"] == []
    assert cuerpo["omittedClaims"] == 1
