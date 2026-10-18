"""`POST /rag/query`: la salida generada con "recomendado/recomendamos/standard of care" se retira (US-064 AC-7/8, RN-23).

Decisión del usuario (2026-10-18): el nivel A de ``terminos-prohibidos.json`` cubre las formulaciones de recomendación
directa que antes pasaban el verificador de salida generada. Los textos son sintéticos.
"""

from __future__ import annotations

import pytest

from app.application.ports import EvidenciaGenerada
from app.domain.citations import OpcionGenerada
from app.domain.support import RETIRO_ES
from tests.support.generador_falso import OPCION_ANTI_HER2
from tests.support.nli_falso import IMPLICA, NliFalso
from tests.support.recuperacion import Q_HER2, crear_entorno, solicitud_de

FRASES_PRESCRIPTIVAS = [
    "Trastuzumab es el tratamiento recomendado.",
    "Recomendamos trastuzumab.",
    "Trastuzumab es el régimen recomendado.",
    "Se sugiere considerar trastuzumab.",
    "Es la opción preferible.",
    "Trastuzumab is the recommended regimen.",
    "Trastuzumab is the recommended treatment.",
    "We recommend trastuzumab.",
    "Trastuzumab is the standard of care.",
]

FRASES_DESCRIPTIVAS = [
    "La evidencia recuperada describe la adición de terapia anti-HER2 a la quimioterapia.",
    "Los autores del ensayo no emiten una recomendación formal.",
    "El ensayo comparó trastuzumab con observación en el grupo adyuvante.",
]


class _GeneradorDeFrase:
    def __init__(self, razon: str, limitaciones: tuple[str, ...] = ()) -> None:
        self._razon = razon
        self._limitaciones = limitaciones

    async def generar(self, solicitud, recuperacion) -> EvidenciaGenerada:
        opcion = OpcionGenerada(OPCION_ANTI_HER2, self._razon, ("ch-m1-1",))
        return EvidenciaGenerada(opciones=(opcion,), limitaciones_propuestas=self._limitaciones)


def _consultar(razon: str, limitaciones: tuple[str, ...] = ()) -> dict:
    entorno = crear_entorno(
        generador=_GeneradorDeFrase(razon, limitaciones),
        clasificador_nli=NliFalso(por_defecto=IMPLICA),
    )
    respuesta = entorno.consultar(solicitud_de(Q_HER2))
    assert respuesta.status_code == 200
    return respuesta.json()


@pytest.mark.ac("US-064", 7)
@pytest.mark.parametrize("frase", FRASES_PRESCRIPTIVAS)
def test_rag_query_descarta_la_opcion_con_el_literal_de_retiro_cuando_la_justificacion_es_una_recomendacion_directa(
    frase: str,
) -> None:
    cuerpo = _consultar(frase)

    assert cuerpo["evidenceOptions"] == []
    (descartada,) = cuerpo["discardedOptions"]
    assert descartada["rationale"] == RETIRO_ES
    assert frase not in str(cuerpo)


@pytest.mark.ac("US-064", 8)
@pytest.mark.parametrize("frase", FRASES_PRESCRIPTIVAS)
def test_rag_query_omite_la_limitacion_y_cuenta_omitted_claims_cuando_es_una_recomendacion_directa(
    frase: str,
) -> None:
    cuerpo = _consultar(FRASES_DESCRIPTIVAS[0], (frase,))

    assert cuerpo["limitations"] == []
    assert cuerpo["omittedClaims"] == 1
    assert frase not in str(cuerpo)


@pytest.mark.parametrize("frase", FRASES_DESCRIPTIVAS)
def test_rag_query_conserva_la_opcion_cuando_la_justificacion_es_descriptiva(frase: str) -> None:
    cuerpo = _consultar(frase)

    assert len(cuerpo["evidenceOptions"]) == 1 and cuerpo["discardedOptions"] == []
