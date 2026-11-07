"""Plantillas del turno de faltantes (US-263, glosario S6 §3): regla pura, sin E/S ni LLM."""

from pathlib import Path

import pytest

from app.domain.chat.faltantes import (
    ItemDeCompletitud,
    TipoDeVacio,
    segun_el_catalogo,
    verbalizar_faltantes,
)
from app.domain.chat.turno import TipoDeBloque
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms

LISTA = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "clinical-catalogs"
    / "lenguaje"
    / "terminos-prohibidos.json"
)

FUENTES = {
    "tnm": ("historia_clinica", "examen"),
    "re": ("examen",),
    "ki67": ("examen",),
    "estado_menopausico": ("historia_clinica",),
}


def _item(clave: str, etiqueta: str, estado: str, tipo: str | None) -> ItemDeCompletitud:
    return ItemDeCompletitud(clave, etiqueta, estado, tipo)


UN_ITEM_DE_CADA_TIPO = (
    _item("estado_menopausico", "Estado menopáusico", "faltante", "no_encontrado"),
    _item("ki67", "Ki-67", "faltante", "no_buscado"),
    _item("re", "Receptor de estrógeno", "presente_sin_verificar", "incompleto"),
    _item("tnm", "Estadificación TNM", "presente_verificado", "por_conciliar"),
)


def _verbalizar(items=UN_ITEM_DE_CADA_TIPO, version="1.8.0"):
    return verbalizar_faltantes(items, FUENTES, version)


def test_verbalizar_faltantes_emite_un_bloque_faltante_por_item_con_tipo_de_vacio_cuando_hay_vacios():
    bloques = _verbalizar()

    assert len(bloques) == 4
    assert {b.tipo for b in bloques} == {TipoDeBloque.faltante}
    assert all(not b.fact_refs for b in bloques)


def test_verbalizar_faltantes_sigue_el_orden_del_catalogo_cuando_los_items_llegan_desordenados():
    bloques = _verbalizar(tuple(reversed(UN_ITEM_DE_CADA_TIPO)))

    assert [b.texto.split(":")[0] for b in bloques] == [
        "Estadificación TNM",
        "Receptor de estrógeno",
        "Ki-67",
        "Estado menopáusico",
    ]


def test_verbalizar_faltantes_dice_no_se_hallo_en_los_documentos_procesados_cuando_el_tipo_es_no_encontrado():
    (bloque,) = _verbalizar(UN_ITEM_DE_CADA_TIPO[:1])

    assert bloque.texto == (
        "Estado menopáusico: no se halló en los documentos procesados (historia clínica)."
    )


def test_verbalizar_faltantes_nombra_los_dos_tipos_de_documento_cuando_el_catalogo_declara_ambos():
    item = _item("tnm", "Estadificación TNM", "faltante", "no_encontrado")

    (bloque,) = _verbalizar((item,))

    assert "(historia clínica o examen)" in bloque.texto


def test_verbalizar_faltantes_dice_que_no_se_ha_procesado_ningun_documento_cuando_el_tipo_es_no_buscado():
    (bloque,) = _verbalizar(UN_ITEM_DE_CADA_TIPO[1:2])

    assert bloque.texto == "Ki-67: aún no se ha procesado ningún documento de tipo examen."


def test_verbalizar_faltantes_dice_incompleto_o_sin_verificar_cuando_el_tipo_es_incompleto():
    (bloque,) = _verbalizar(UN_ITEM_DE_CADA_TIPO[2:3])

    assert bloque.texto == "Receptor de estrógeno: el dato está incompleto o sin verificar."


def test_verbalizar_faltantes_dice_registros_en_conflicto_cuando_el_tipo_es_por_conciliar():
    (bloque,) = _verbalizar(UN_ITEM_DE_CADA_TIPO[3:])

    assert bloque.texto == "Estadificación TNM: hay registros en conflicto por conciliar."


def test_verbalizar_faltantes_no_emite_bloque_para_un_item_no_aplica_aunque_traiga_tipo_de_vacio():
    items = (_item("ki67", "Ki-67", "no_aplica", "no_buscado"),)

    (bloque,) = _verbalizar(items)

    assert bloque.tipo is TipoDeBloque.limitacion


def test_verbalizar_faltantes_omite_los_tipos_de_documento_cuando_el_item_no_esta_en_el_catalogo():
    item = _item("her2", "HER2", "faltante", "no_encontrado")

    (bloque,) = _verbalizar((item,))

    assert bloque.texto == "HER2: no se halló en los documentos procesados."


def test_verbalizar_faltantes_dice_que_no_faltan_datos_y_nombra_la_version_cuando_ningun_item_tiene_vacio():
    items = (_item("tnm", "Estadificación TNM", "presente_verificado", None),)

    (bloque,) = _verbalizar(items, version="1.8.0")

    assert bloque.tipo is TipoDeBloque.limitacion
    assert bloque.texto == "No faltan datos críticos según el catálogo 1.8.0."


@pytest.mark.parametrize("indice", range(len(UN_ITEM_DE_CADA_TIPO)))
def test_verbalizar_faltantes_nunca_afirma_que_el_dato_esta_ausente_en_el_paciente_cuando_verbaliza_cada_tipo(
    indice,
):
    (bloque,) = _verbalizar(UN_ITEM_DE_CADA_TIPO[indice : indice + 1])
    lista = ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))

    assert "ausente en el paciente" not in bloque.texto
    assert "carece" not in bloque.texto
    assert (
        check_prohibited_terms(bloque.texto, lista, niveles=("A", "B"), permitir_frases=False) == []
    )


def test_segun_el_catalogo_usa_la_etiqueta_del_catalogo_y_descarta_el_item_desconocido_cuando_la_peticion_trae_otra():
    items = (
        _item("ki67", "SINT-etiqueta-ajena-al-catalogo", "faltante", "no_buscado"),
        _item("no_existe", "Dato inventado", "faltante", "no_buscado"),
    )

    resultado = segun_el_catalogo(items, {"ki67": "Ki-67"})

    assert [(i.clave, i.etiqueta) for i in resultado] == [("ki67", "Ki-67")]


@pytest.mark.parametrize("tipo", list(TipoDeVacio))
def test_verbalizar_faltantes_tiene_una_plantilla_por_cada_miembro_de_tipo_de_vacio(tipo):
    (bloque,) = _verbalizar((_item("ki67", "Ki-67", "faltante", tipo),))

    assert bloque.tipo is TipoDeBloque.faltante
    assert bloque.texto.startswith("Ki-67: ")
