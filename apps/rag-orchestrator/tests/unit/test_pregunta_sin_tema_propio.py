"""Gate G1 del segundo loop contextual (US-271, ADR-52): ``pregunta_sin_tema_propio`` sobre un léxico mínimo, sin adapters."""

from app.domain.pregunta_sin_tema_propio import (
    MarcosDeIdioma,
    MarcosDePregunta,
    pregunta_sin_tema_propio,
)

LEXICO = MarcosDePregunta(
    version="test",
    por_idioma={
        "es": MarcosDeIdioma(
            marcos=("ensayos clinicos", "caso clinico"),
            vacias=frozenset(
                {"que", "evidencia", "hay", "para", "este", "caso", "paciente", "ensayos", "dice"}
            ),
        ),
        "en": MarcosDeIdioma(
            marcos=("clinical trials",),
            vacias=frozenset({"what", "evidence", "is", "there", "for", "this", "case", "the"}),
        ),
    },
)


def _es_generica(pregunta: str, idiomas=("es",)) -> bool:
    return pregunta_sin_tema_propio(pregunta, LEXICO, idiomas)


def test_pregunta_es_generica_cuando_solo_tiene_palabras_vacias():
    assert _es_generica("¿Qué evidencia hay para este caso?") is True


def test_pregunta_no_es_generica_cuando_nombra_un_tema():
    assert _es_generica("¿Qué evidencia hay sobre melanoma uveal?") is False


def test_pregunta_es_generica_cuando_el_marco_es_una_frase_de_varias_palabras():
    assert _es_generica("¿Qué ensayos clínicos hay para este caso clínico?") is True


def test_pregunta_conserva_la_palabra_de_contenido_cuando_el_marco_solo_cubre_parte():
    assert _es_generica("¿Qué ensayos clínicos hay de pembrolizumab?") is False


def test_pregunta_ignora_mayusculas_tildes_y_puntuacion_cuando_se_normaliza():
    assert _es_generica("  ¡QUÉ   Evidencia, hay... PARA este CASO!? ") is True


def test_pregunta_vacia_no_es_generica_cuando_no_hay_texto_tras_normalizar():
    assert _es_generica("¿?  ...") is False
    assert _es_generica("") is False


def test_pregunta_en_ingles_es_generica_cuando_se_evalua_con_el_idioma_ingles():
    assert _es_generica("What evidence is there for this case?", ("en",)) is True


def test_pregunta_no_es_generica_cuando_el_idioma_no_trae_sus_palabras_vacias():
    assert _es_generica("What evidence is there for this case?", ("es",)) is False


def test_pregunta_es_generica_con_la_union_de_idiomas_cuando_el_idioma_es_ambiguo():
    assert _es_generica("What is the evidencia para este case", ("es", "en")) is True


def test_pregunta_ignora_un_idioma_desconocido_cuando_no_esta_en_el_lexico():
    assert _es_generica("¿Qué evidencia hay para este caso?", ("fr", "es")) is True
    assert _es_generica("¿Qué evidencia hay para este caso?", ("fr",)) is False


def test_pregunta_es_generica_cuando_la_palabra_suelta_de_un_marco_es_vacia_por_si_sola():
    assert _es_generica("ensayos") is True


def test_pregunta_no_es_generica_cuando_junto_al_marco_queda_un_tema():
    assert _es_generica("para este caso clinico melanoma") is False
