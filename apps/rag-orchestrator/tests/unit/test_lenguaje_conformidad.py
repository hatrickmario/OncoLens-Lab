"""Conformidad de ``check_prohibited_terms`` con la referencia TypeScript (RN-23, US-068 AC-2, US-249 AC-3)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.domain.lenguaje import ListaTerminos, check_prohibited_terms

RAIZ = Path(__file__).resolve().parents[4]
CASOS = RAIZ / "packages" / "clinical-language" / "conformidad" / "casos.json"
LISTA = RAIZ / "packages" / "clinical-catalogs" / "lenguaje" / "terminos-prohibidos.json"


def _casos() -> list[dict[str, Any]]:
    return json.loads(CASOS.read_text(encoding="utf-8"))["casos"]


def _lista() -> ListaTerminos:
    return ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))


@pytest.mark.ac("US-249", 3)
def test_check_prohibited_terms_casos_de_conformidad_mismos_ids_y_niveles_y_nombra_el_caso_que_falla() -> (
    None
):
    lista = _lista()
    casos = _casos()
    assert len(casos) >= 150
    assert len({caso["id"] for caso in casos}) == len(casos)

    discrepancias = []
    for caso in casos:
        coincidencias = check_prohibited_terms(
            caso["texto"],
            lista,
            niveles=tuple(caso["niveles"]),
            permitir_frases=caso["permitirFrases"],
            solo_ids_b=caso.get("soloIdsB"),
            excepciones_b=caso.get("excepcionesB"),
        )
        obtenido = [{"id": c.id, "nivel": c.nivel} for c in coincidencias]
        if obtenido != caso["esperado"]:
            discrepancias.append(
                (caso["id"], caso["grupo"], caso["texto"], caso["esperado"], obtenido)
            )

    assert discrepancias == []


def test_check_prohibited_terms_limita_el_nivel_b_a_los_ids_pedidos_cuando_recibe_solo_ids_b() -> (
    None
):
    lista = _lista()
    texto = "La guía recomienda evaluar administrar trastuzumab"

    def ids(solo: list[str] | None) -> list[str]:
        return [
            c.id for c in check_prohibited_terms(texto, lista, niveles=("A", "B"), solo_ids_b=solo)
        ]

    assert ids(None) == ["b-recomiend", "b-es-administrar"]
    assert ids(["b-recomiend"]) == ["b-recomiend"]
    assert ids([]) == []


def test_lista_vigente_declara_la_version_1_6_0_y_el_subconjunto_b_de_la_salida_generada() -> None:
    lista = _lista()

    assert lista.version == "1.6.0"
    assert lista.salida_generada.nivel_b == ["b-recomend", "b-recomiend", "b-recommend"]


def test_lista_falla_cerrada_cuando_salida_generada_trae_un_id_que_no_existe_en_el_nivel_b() -> (
    None
):
    datos = json.loads(LISTA.read_text(encoding="utf-8"))
    datos["salidaGenerada"]["nivelB"].append("b-no-existe")

    with pytest.raises(ValidationError, match="b-no-existe"):
        ListaTerminos.model_validate(datos)


@pytest.mark.parametrize("valor", ["ausente", "vacio"])
def test_lista_falla_cerrada_cuando_salida_generada_falta_o_queda_vacia(valor: str) -> None:
    datos = json.loads(LISTA.read_text(encoding="utf-8"))
    if valor == "ausente":
        datos.pop("salidaGenerada")
    else:
        datos["salidaGenerada"]["nivelB"] = []

    with pytest.raises(ValidationError, match="salidaGenerada|salida_generada"):
        ListaTerminos.model_validate(datos)
