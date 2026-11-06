"""Reglas puras del enrutado del chat (US-259, design D3): sin adapters."""

import pytest

from app.domain.chat.enrutado import clasificar_por_reglas, es_fuera_de_alcance
from app.domain.chat.estado import Intencion

TERMINOS = {"mama": frozenset({"mama", "mamario"}), "prostata": frozenset({"prostata"})}


@pytest.mark.parametrize(
    ("pregunta", "intencion"),
    [
        ("¿Cuál es la situación actual?", Intencion.caso),
        ("Dame un resumen del paciente", Intencion.caso),
        ("¿Qué información falta?", Intencion.faltantes),
        ("¿Qué datos faltan para completar el caso?", Intencion.faltantes),
        ("¿Qué evidencia existe…?", Intencion.evidencia),
        ("¿Qué estudios describen terapia endocrina?", Intencion.evidencia),
        ("¿Qué tratamiento previo ha recibido y cuándo?", Intencion.caso),
        ("¿Qué tratamientos previos ha recibido?", Intencion.caso),
        ("¿Qué tratamiento anterior recibió?", Intencion.caso),
        ("¿Qué fuentes respaldan la respuesta?", Intencion.fuentes_limitaciones),
        ("¿Qué limitaciones tiene esto?", Intencion.fuentes_limitaciones),
    ],
)
def test_clasifica_por_reglas_la_intencion_cuando_la_pregunta_trae_su_patron(pregunta, intencion):
    assert clasificar_por_reglas(pregunta) is intencion


def test_prefiere_faltantes_a_evidencia_cuando_la_pregunta_trae_ambos_patrones():
    assert clasificar_por_reglas("¿Qué evidencia falta?") is Intencion.faltantes


@pytest.mark.parametrize("pregunta", ["Necesito ayuda con este caso", "Hola", ""])
def test_devuelve_none_cuando_ninguna_regla_clasifica(pregunta):
    assert clasificar_por_reglas(pregunta) is None


@pytest.mark.parametrize(
    "pregunta", ["¿Qué tratamiento debe recibir?", "¿Qué terapia recomiendan las guías?"]
)
def test_clasifica_como_evidencia_cuando_la_pregunta_es_prescriptiva(pregunta):
    assert clasificar_por_reglas(pregunta) is Intencion.evidencia


@pytest.mark.parametrize(
    ("pregunta", "fuera"),
    [
        ("¿Qué describe la evidencia sobre cáncer de próstata?", True),
        ("¿Aplica lo de [NOMBRE]?", True),
        ("¿Qué sabemos del teléfono [TELEFONO]?", True),
        ("¿Qué describe la evidencia sobre cáncer de mama?", False),
        ("¿Qué evidencia compara mama y próstata?", False),
        ("¿Qué tratamiento debe recibir?", False),
    ],
)
def test_es_fuera_de_alcance_aplica_la_regla_del_seguimiento_cuando_el_contexto_es_mama(
    pregunta, fuera
):
    assert es_fuera_de_alcance(pregunta, "mama", TERMINOS) is fuera
