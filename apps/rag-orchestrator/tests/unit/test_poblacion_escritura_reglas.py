"""Forma escrita de ``population_criteria`` y caché por versión (US-242, D5, D6, D10–D12). Reglas puras, sin adapters."""

from __future__ import annotations

from typing import Any

import pytest

from app.domain.corpus_metadata.poblacion_abanico import ValorPropuesto
from app.domain.corpus_metadata.poblacion_escritura import (
    FORMA_LISTA,
    FormaDePoblacionIncoherente,
    VersionesDeExtraccion,
    campos_de_poblacion,
    criterios_con_valores,
    criterios_reutilizables,
    exigir_forma_de_lista,
    integrar_poblacion_en_abanico,
    lista_de_criterio,
    marca_pendiente,
)
from app.domain.corpus_metadata.resultado import FUENTE_ESTRUCTURADA, MetadatosResueltos

VERSIONES = VersionesDeExtraccion("poblacion_v1", "modelo-1", "cat-1")


def _valor(texto: str = "stage II", chunk: str = "c1") -> ValorPropuesto:
    return ValorPropuesto(texto, chunk, "elegibilidad", "entailment")


def _lista(
    *valores: ValorPropuesto, versiones: VersionesDeExtraccion = VERSIONES
) -> list[dict[str, str]]:
    return lista_de_criterio(valores, versiones)


def _metadatos() -> MetadatosResueltos:
    return MetadatosResueltos(
        "eca", None, None, None, {"estadio": "no_disponible"}, FUENTE_ESTRUCTURADA
    )


def test_lista_de_criterio_guarda_el_valor_su_fragmento_el_alcance_y_la_procedencia() -> None:
    assert _lista(_valor()) == [
        {
            "value": "stage II",
            "chunkId": "c1",
            "scope": "elegibilidad",
            "promptVersion": "poblacion_v1",
            "modelVersion": "modelo-1",
            "catalogVersion": "cat-1",
            "nliResult": "entailment",
        }
    ]


def test_marca_pendiente_es_status_pendiente_con_valores_vacios_y_una_copia_nueva_cada_vez() -> (
    None
):
    marca = marca_pendiente()

    assert marca == {"status": "pendiente", "values": []}
    marca["values"].append("x")
    assert marca_pendiente()["values"] == []


def test_exigir_forma_de_lista_acepta_listas_vacias_o_completas_y_la_marca_pendiente() -> None:
    exigir_forma_de_lista({"a": [], "b": _lista(_valor()), "c": marca_pendiente()})


@pytest.mark.parametrize(
    "contenido",
    [
        {"values": [{"value": "x"}]},  # P5: {values} sin status
        {"status": "pendiente", "values": [{"value": "x"}]},  # pendiente con valores
        {"status": "otro", "values": []},
        "stage II",  # forma antigua
        [{"value": "x", "chunkId": "c1", "scope": "elegibilidad"}],  # sin procedencia
        [{**_lista(_valor())[0], "extra": "x"}],  # clave de más
        [{**_lista(_valor())[0], "value": "x" * 201}],  # P6: más de 200 caracteres
        [{**_lista(_valor())[0], "value": ""}],
    ],
)
def test_exigir_forma_de_lista_rechaza_lo_que_no_es_ni_lista_ni_marca_y_nombra_solo_la_clave(
    contenido: Any,
) -> None:
    with pytest.raises(FormaDePoblacionIncoherente) as fallo:
        exigir_forma_de_lista({"estadio": contenido})

    assert str(fallo.value) == "estadio"


def test_criterios_con_valores_excluye_vacios_y_pendientes() -> None:
    criterios = {"a": _lista(_valor()), "b": [], "c": marca_pendiente()}

    assert criterios_con_valores(criterios) == ("a",)


def test_campos_de_poblacion_resume_los_valores_de_cada_criterio_con_valores() -> None:
    criterios = {"a": _lista(_valor("uno"), _valor("dos")), "b": []}

    assert [(c.campo, c.valor) for c in campos_de_poblacion(criterios)] == [("a", "uno; dos")]


def test_integrar_poblacion_escribe_la_forma_lista_y_conserva_los_escalares_y_el_origen() -> None:
    criterios = {"estadio": _lista(_valor()), "ecog": []}

    integrado = integrar_poblacion_en_abanico(_metadatos(), criterios)

    assert integrado.population_form == FORMA_LISTA
    assert integrado.population_criteria == criterios
    assert integrado.study_design == "eca"
    assert [c.campo for c in integrado.campos_verificados] == ["estadio"]


def test_integrar_poblacion_no_escribe_una_forma_incoherente() -> None:
    with pytest.raises(FormaDePoblacionIncoherente):
        integrar_poblacion_en_abanico(_metadatos(), {"estadio": {"values": []}})


def test_criterios_reutilizables_reutiliza_lo_extraido_con_las_mismas_versiones() -> None:
    guardado = {"a": _lista(_valor()), "b": []}

    assert criterios_reutilizables(guardado, FORMA_LISTA, ["a", "b"], VERSIONES) == {"a", "b"}


@pytest.mark.parametrize(
    "otra",
    [
        VersionesDeExtraccion("poblacion_v2", "modelo-1", "cat-1"),
        VersionesDeExtraccion("poblacion_v1", "modelo-2", "cat-1"),
        VersionesDeExtraccion("poblacion_v1", "modelo-1", "cat-2"),
    ],
)
def test_criterios_reutilizables_no_reutiliza_nada_si_cambia_el_prompt_el_modelo_o_el_catalogo(
    otra: VersionesDeExtraccion,
) -> None:
    guardado = {"a": _lista(_valor()), "b": []}

    assert criterios_reutilizables(guardado, FORMA_LISTA, ["a", "b"], otra) == frozenset()


def test_criterios_reutilizables_reintenta_el_criterio_pendiente_y_el_que_no_esta_guardado() -> (
    None
):
    guardado = {"a": _lista(_valor()), "b": marca_pendiente()}

    assert criterios_reutilizables(guardado, FORMA_LISTA, ["a", "b", "c"], VERSIONES) == {"a"}


def test_criterios_reutilizables_no_da_por_hecho_un_vacio_sin_valores_que_prueben_la_version() -> (
    None
):
    assert (
        criterios_reutilizables({"a": [], "b": []}, FORMA_LISTA, ["a", "b"], VERSIONES)
        == frozenset()
    )


def test_criterios_reutilizables_ignora_la_forma_antigua() -> None:
    assert (
        criterios_reutilizables({"estadio": "II"}, "antigua", ["estadio"], VERSIONES) == frozenset()
    )
