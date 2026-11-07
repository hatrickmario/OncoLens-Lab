"""Reglas puras de la relevancia de un dato faltante en el chat (US-264, RN-29, RN-27): sin adapters, sobre el catálogo real."""

import pytest

from app.config.settings import Settings
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from app.domain.chat.relevancia import (
    TextosDelCatalogo,
    con_minuscula_inicial,
    criterios_que_usan,
    identificar_dato_critico,
    texto_del_bloque_de_catalogo,
)
from app.infrastructure.catalogo_clinico.relevancia import cargar_datos_de_relevancia
from tests.support.contract import CATALOGOS

DATOS = cargar_datos_de_relevancia(CATALOGOS, ("mama", "prostata"))
CRITICOS = DATOS.datos_criticos("mama")
SINONIMOS = DATOS.sinonimos("mama")
CRITERIOS = DATOS.criterios("mama")
TEXTOS = TextosDelCatalogo(
    dato_critico="<dato> es crítico (versión <version>).",
    criterios="Lo usan: <criterios>.",
    sin_criterio="Ninguno lo usa.",
)


def _clave(pregunta: str) -> str | None:
    dato = identificar_dato_critico(pregunta, CRITICOS, SINONIMOS)
    return None if dato is None else dato.clave


@pytest.mark.parametrize(
    ("pregunta", "clave"),
    [
        ("¿Por qué importa el estado menopáusico?", "estado_menopausico"),
        ("¿Por qué importa el Ki-67?", "ki67"),
        ("por que importa ESTADO MENOPAUSICO", "estado_menopausico"),
        ("¿Por qué importa el HER2 por IHQ?", "her2_ihq"),
    ],
)
def test_identifica_el_dato_por_su_etiqueta_cuando_la_pregunta_la_nombra(pregunta, clave):
    assert _clave(pregunta) == clave


@pytest.mark.parametrize(
    ("pregunta", "clave"),
    [
        ("¿Por qué importa el Ki67?", "ki67"),
        ("¿Y el índice de proliferación, por qué importa?", "ki67"),
        ("¿Por qué importa el ER?", "re"),
        ("¿Por qué importa el receptor de progesterona?", "rp"),
    ],
)
def test_identifica_el_dato_por_un_sinonimo_del_catalogo_cuando_la_pregunta_no_usa_la_etiqueta(
    pregunta, clave
):
    assert _clave(pregunta) == clave


@pytest.mark.parametrize(
    ("pregunta", "clave"),
    [("¿Por qué importa el TNM?", "tnm"), ("¿Por qué importa el ECOG?", "ecog")],
)
def test_identifica_el_dato_por_su_clave_cuando_solo_se_nombra_la_sigla(pregunta, clave):
    assert _clave(pregunta) == clave


def test_prefiere_el_termino_mas_largo_cuando_la_pregunta_nombra_dos_datos():
    assert _clave("¿Por qué importa el receptor de estrógeno frente al grado histológico?") == "re"
    assert _clave("¿Por qué importa el grado histológico?") == "grado"


@pytest.mark.parametrize(
    "pregunta", ["¿Por qué importa el CA 15-3?", "¿Por qué importa el PSA?", "Hola", ""]
)
def test_devuelve_none_cuando_la_pregunta_no_nombra_ningun_dato_del_catalogo(pregunta):
    assert identificar_dato_critico(pregunta, CRITICOS, SINONIMOS) is None


def test_no_toma_un_termino_dentro_de_otra_palabra_cuando_busca_por_sigla():
    assert (
        identificar_dato_critico("¿Por qué importa el reconocimiento?", CRITICOS, SINONIMOS) is None
    )


def _dato(clave: str):
    return next(d for d in CRITICOS if d.clave == clave)


def _claves_de_criterios(clave: str) -> list[str]:
    return [c.clave for c in criterios_que_usan(_dato(clave), CRITERIOS)]


def test_devuelve_el_criterio_cuando_su_destino_es_el_mismo_que_el_del_dato():
    assert _claves_de_criterios("estado_menopausico") == ["estado_menopausico"]
    assert _claves_de_criterios("tnm") == ["estadio"]


def test_devuelve_vacio_cuando_ningun_criterio_usa_el_destino_del_dato():
    assert _claves_de_criterios("ki67") == []
    assert _claves_de_criterios("grado") == []


def test_devuelve_el_criterio_que_agrupa_el_valor_cuando_el_destino_del_dato_es_uno_de_varios():
    assert _claves_de_criterios("re") == ["receptores_hormonales"]
    assert _claves_de_criterios("rp") == ["receptores_hormonales"]


def test_ignora_la_prueba_del_dato_cuando_el_criterio_solo_exige_el_biomarcador():
    assert _claves_de_criterios("her2_ihq") == ["estado_her2"]
    assert _claves_de_criterios("her2_ish") == ["estado_her2"]


def test_no_mezcla_biomarcadores_distintos_cuando_comparten_entidad_y_campo():
    assert "estado_her2" not in _claves_de_criterios("ki67")
    assert "receptores_hormonales" not in _claves_de_criterios("brca_germinal")


def test_el_bloque_nombra_la_version_y_la_etiqueta_de_cada_criterio_cuando_hay_criterios():
    criterios = criterios_que_usan(_dato("estado_menopausico"), CRITERIOS)

    texto = texto_del_bloque_de_catalogo(_dato("estado_menopausico"), criterios, "1.7.0", TEXTOS)

    assert texto == "Estado menopáusico es crítico (versión 1.7.0). Lo usan: Estado menopáusico."


def test_el_bloque_usa_el_texto_fijo_de_sin_criterio_cuando_ningun_criterio_usa_el_dato():
    texto = texto_del_bloque_de_catalogo(_dato("ki67"), (), "1.7.0", TEXTOS)

    assert texto == "Ki-67 es crítico (versión 1.7.0). Ninguno lo usa."


def test_el_bloque_separa_las_etiquetas_con_punto_y_coma_cuando_hay_varios_criterios():
    criterios = criterios_que_usan(_dato("re"), CRITERIOS) + criterios_que_usan(
        _dato("estado_menopausico"), CRITERIOS
    )

    texto = texto_del_bloque_de_catalogo(_dato("re"), criterios, "1.7.0", TEXTOS)

    assert texto.endswith("Lo usan: Receptores hormonales (RE/RP); Estado menopáusico.")


def test_los_textos_fijos_de_configuracion_no_contienen_terminos_prohibidos_ni_llaves():
    lista = ListaTerminos.model_validate_json(
        (CATALOGOS / "lenguaje" / "terminos-prohibidos.json").read_text(encoding="utf-8")
    )
    ajustes = Settings(_env_file=None)  # type: ignore[call-arg]
    textos = [
        ajustes.chat_relevancia_catalogo_texto,
        ajustes.chat_relevancia_criterios_texto,
        ajustes.chat_relevancia_sin_criterio_texto,
        ajustes.chat_relevancia_sin_soporte_texto,
        ajustes.chat_relevancia_fuera_del_catalogo_texto,
        ajustes.chat_relevancia_sin_evidencia_aviso,
    ]

    for texto in textos:
        assert check_prohibited_terms(texto, lista, niveles=("A", "B"), permitir_frases=False) == []
        assert (
            "{" not in texto and "}" not in texto
        )  # la llave rompe el valor por defecto de Compose


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("Los estudios reportan el dato.", "los estudios reportan el dato."),
        ("Estado menopáusico se registra.", "estado menopáusico se registra."),
        ("Ki-67 se reporta junto con el grado.", "Ki-67 se reporta junto con el grado."),
        ("HER2 se midió por IHQ.", "HER2 se midió por IHQ."),
        ("ECOG se usó como criterio.", "ECOG se usó como criterio."),
        ("", ""),
    ],
)
def test_pone_minuscula_inicial_solo_cuando_la_primera_palabra_es_comun(texto, esperado):
    assert con_minuscula_inicial(texto) == esperado
