from app.domain.contexto_del_seguimiento import (
    ContextoDelSeguimiento as C,
)
from app.domain.contexto_del_seguimiento import clasificar_contexto_del_seguimiento

TERMINOS = {
    "mama": frozenset({"mama", "cancer de mama"}),
    "prostata": frozenset({"prostata", "cancer de prostata"}),
}


def _clasificar(pregunta: str, tipo: str = "mama") -> C:
    return clasificar_contexto_del_seguimiento(pregunta, tipo, TERMINOS)


def test_clasificar_contexto_devuelve_en_contexto_cuando_la_pregunta_no_nombra_a_nadie_ni_otro_cancer():
    assert _clasificar("¿Qué describe la evidencia sobre el estado menopáusico?") is C.en_contexto


def test_clasificar_contexto_devuelve_fuera_de_contexto_cuando_la_pregunta_trae_un_marcador_de_identidad():
    assert _clasificar("¿Aplica a [NOMBRE]?") is C.fuera_de_contexto
    assert _clasificar("Llamar al [TELEFONO] sobre la evidencia") is C.fuera_de_contexto


def test_clasificar_contexto_devuelve_fuera_de_contexto_cuando_solo_nombra_otro_tipo_de_cancer():
    assert _clasificar("¿Qué dice la evidencia del CÁNCER de PRÓSTATA?") is C.fuera_de_contexto


def test_clasificar_contexto_devuelve_en_contexto_cuando_la_comparativa_nombra_el_tipo_del_contexto_y_otro():
    pregunta = "¿La evidencia compara cáncer de mama con cáncer de próstata?"
    assert _clasificar(pregunta) is C.en_contexto


def test_clasificar_contexto_no_toma_un_termino_dentro_de_otra_palabra_cuando_el_tipo_aparece_como_subcadena():
    assert _clasificar("¿Qué describe la evidencia sobre prostatitis?") is C.en_contexto


def test_clasificar_contexto_ignora_marcadores_de_fecha_cuando_la_pregunta_solo_enmascara_fechas():
    assert _clasificar("¿Qué describe la evidencia desde [FECHA]?") is C.en_contexto
