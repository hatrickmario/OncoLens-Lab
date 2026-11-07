"""Reglas puras del enrutado del chat (US-259, design D3): sin adapters."""

import pytest

from app.domain.chat.enrutado import (
    clasificar_por_reglas,
    es_fuera_de_alcance,
    es_pregunta_de_relevancia,
)
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
        ("¿Qué tratamiento anterior debe recibir?", Intencion.evidencia),
        ("¿Qué tratamiento previo debe recibir?", Intencion.evidencia),
        ("¿Qué tratamiento anterior recibió?", Intencion.caso),
        ("¿Qué fuentes respaldan la respuesta?", Intencion.fuentes_limitaciones),
        ("¿Qué limitaciones tiene esto?", Intencion.fuentes_limitaciones),
        ("¿Cuáles son las fuentes y las limitaciones?", Intencion.fuentes_limitaciones),
        ("¿De dónde sale esa información?", Intencion.fuentes_limitaciones),
        ("¿Qué no cubre lo que se mostró?", Intencion.fuentes_limitaciones),
        ("¿Hasta qué fecha llega el corpus?", Intencion.fuentes_limitaciones),
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


CATALOGO = frozenset({"psa", "ki 67", "ca 15 3", "antigeno prostatico especifico"})


@pytest.mark.parametrize(
    "pregunta",
    [
        "¿Cuál fue el resultado de la gammagrafía ósea?",
        "¿Cuál fue el resultado del PSA?",
        "¿Qué ocurrió en los últimos 10 días?",
        "¿Qué pasó en el último mes?",
        "¿Qué tratamientos recibió en los últimos 3 meses?",
        "¿Qué sucedió con la biopsia?",
        "¿Cuándo se realizó la cirugía?",
        "¿El PSA mejoró o empeoró?",
        "¿Cómo está el Ki-67?",
        "¿Qué valor tiene el antígeno prostático específico?",
    ],
)
def test_clasifica_como_caso_las_preguntas_de_examen_o_periodo_sin_palabra_clave(pregunta):
    assert clasificar_por_reglas(pregunta, CATALOGO) is Intencion.caso


@pytest.mark.parametrize(
    ("pregunta", "intencion"),
    [
        ("¿Qué información falta en los últimos 100 días?", Intencion.faltantes),
        ("¿Qué evidencia hay del PSA en los últimos 5 años?", Intencion.evidencia),
        ("¿Qué fuentes respaldan el resultado del PSA?", Intencion.fuentes_limitaciones),
        ("¿Qué recomienda para el PSA?", Intencion.evidencia),
        ("¿Qué tratamiento debe recibir según el PSA?", Intencion.evidencia),
        ("¿Qué falta registrar del resultado de la biopsia?", Intencion.faltantes),
    ],
)
def test_conserva_faltantes_fuentes_y_evidencia_cuando_la_pregunta_trae_tambien_examen_o_periodo(
    pregunta, intencion
):
    assert clasificar_por_reglas(pregunta, CATALOGO) is intencion


@pytest.mark.parametrize(
    "pregunta",
    [
        "¿Hay contradicciones en el expediente?",
        "¿Hay contradicciones?",
        "¿Algún dato fue corregido?",
        "¿Existe alguna discrepancia entre documentos?",
    ],
)
def test_clasifica_como_caso_las_preguntas_de_contradicciones_sin_invocar_al_llm(pregunta):
    assert clasificar_por_reglas(pregunta) is Intencion.caso


def test_no_clasifica_por_el_catalogo_cuando_la_palabra_solo_esta_dentro_de_otra():
    assert clasificar_por_reglas("Necesito ayuda con el psalmo", CATALOGO) is None


@pytest.mark.parametrize(
    "pregunta",
    [
        "¿Qué evidencia hay en el corpus sobre melanoma uveal?",
        "¿Qué opciones describe el corpus para este caso?",
        "¿Qué debe recibir según el corpus?",
    ],
)
def test_enruta_a_evidencia_cuando_la_pregunta_menciona_el_corpus_sin_marcador_de_metadato(
    pregunta,
):
    assert clasificar_por_reglas(pregunta) is Intencion.evidencia


@pytest.mark.parametrize(
    "pregunta",
    [
        "¿Por qué importa el estado menopáusico?",
        "¿Por qué importa el Ki-67?",
        "¿Por qué es importante el HER2?",
        "¿Para qué sirve el Ki67?",
        "¿Qué relevancia tiene el estado menopáusico?",
        "¿Cuál es la importancia del ECOG?",
    ],
)
def test_clasifica_como_faltantes_y_relevancia_cuando_la_pregunta_pide_por_que_importa_un_dato(pregunta):
    assert clasificar_por_reglas(pregunta, CATALOGO) is Intencion.faltantes
    assert es_pregunta_de_relevancia(pregunta) is True


@pytest.mark.parametrize(
    ("pregunta", "intencion"),
    [
        ("¿Por qué importa la evidencia sobre el Ki-67?", Intencion.evidencia),
        ("¿Por qué importan las fuentes del corpus?", Intencion.fuentes_limitaciones),
    ],
)
def test_conserva_evidencia_y_fuentes_cuando_la_pregunta_de_por_que_importa_trae_su_palabra_clave(pregunta, intencion):
    assert clasificar_por_reglas(pregunta, CATALOGO) is intencion


@pytest.mark.parametrize(
    "pregunta",
    [
        "¿Qué información falta?",
        "¿Por qué importa lo que falta?",
        "¿Cuál es la situación actual?",
        "¿Qué importa registrar?",
    ],
)
def test_no_es_pregunta_de_relevancia_cuando_la_pregunta_no_pide_por_que_importa_un_dato(pregunta):
    assert es_pregunta_de_relevancia(pregunta) is False
