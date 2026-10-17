"""Regla pura RN-23 (``app/domain/lenguaje.py``): sin archivos ni adapters, con una lista mínima en memoria."""

from __future__ import annotations

from typing import Any

import pytest
from app.domain.lenguaje import (
    ListaTerminos,
    check_prohibited_terms,
    clave_flexiva,
    normalizar_texto,
)
from pydantic import ValidationError


def _termino(id_: str, texto: str, **extra: Any) -> dict[str, Any]:
    return {"id": id_, "idioma": "es", "texto": texto, **extra}


def _lista(
    a: list[dict[str, Any]] | None = None,
    b: list[dict[str, Any]] | None = None,
    prefijos: list[dict[str, Any]] | None = None,
    frases: list[str] | None = None,
    version: str = "1.0.0",
) -> ListaTerminos:
    return ListaTerminos.model_validate(
        {
            "version": version,
            "normalizacion": "test",
            "nivelA": {
                "aplicaA": ["salida_generada"],
                "terminos": a if a is not None else [_termino("a-debe", "debe recibir")],
            },
            "nivelB": {
                "aplicaA": ["ui"],
                "prefijos": prefijos
                if prefijos is not None
                else [{"id": "b-recomend", "idioma": "es", "prefijo": "recomend"}],
                "terminos": b or [],
            },
            "frasesPermitidas": {"aplicaA": ["ui"], "frases": frases or []},
        }
    )


def _ids(texto: str, lista: ListaTerminos, **kwargs: Any) -> list[str]:
    return [c.id for c in check_prohibited_terms(texto, lista, **kwargs)]


def test_normalizar_texto_quita_tildes_pasa_a_minusculas_y_colapsa_puntuacion() -> None:
    assert normalizar_texto("  ¡Debería,   RECIBIR—ya! ") == "deberia recibir ya"


@pytest.mark.parametrize(
    ("palabra", "clave"),
    [
        ("recibirlo", "recibir"),  # enclítico
        ("tratamientos", "tratamient"),  # plural nominal
        ("reciben", "recib"),  # plural verbal
        ("paciente", "pacient"),  # género
        ("sus", "sus"),  # menos de 4 letras: no se toca
        ("las", "las"),
    ],
)
def test_clave_flexiva_aplica_cada_regla_solo_con_cuatro_o_mas_letras(
    palabra: str, clave: str
) -> None:
    assert clave_flexiva(palabra) == clave


def test_check_prohibited_terms_devuelve_vacio_cuando_el_texto_esta_vacio() -> None:
    assert check_prohibited_terms("", _lista()) == []


def test_check_prohibited_terms_devuelve_una_coincidencia_cuando_aparece_el_termino_exacto() -> (
    None
):
    coincidencias = check_prohibited_terms("Debe recibir", _lista())

    assert [(c.id, c.termino, c.nivel) for c in coincidencias] == [("a-debe", "debe recibir", "A")]


@pytest.mark.parametrize(
    "texto", ["DEBE RECIBIR", "Debé recibir", "debe, recibir.", "debe recibirlo"]
)
def test_check_prohibited_terms_ignora_mayusculas_tildes_puntuacion_y_enclitico(texto: str) -> None:
    assert _ids(texto, _lista()) == ["a-debe"]


def test_check_prohibited_terms_cubre_plural_verbal_y_genero() -> None:
    lista = _lista(a=[_termino("a-rec", "recomendada para esta paciente")])

    assert _ids("recomendado para este paciente", lista) == ["a-rec"]
    assert _ids("recomendadas para estas pacientes", lista) == ["a-rec"]


def test_check_prohibited_terms_cuenta_cada_aparicion() -> None:
    assert _ids("debe recibir y luego debe recibir", _lista()) == ["a-debe", "a-debe"]


def test_check_prohibited_terms_no_une_palabras_no_consecutivas() -> None:
    assert _ids("debe luego recibir", _lista()) == []


def test_check_prohibited_terms_con_dos_terminos_de_la_misma_clave_gana_el_de_texto_igual() -> None:
    lista = _lista(a=[_termino("a-uno", "debe recibirse"), _termino("a-dos", "debe recibir")])

    assert _ids("debe recibir", lista) == ["a-dos"]
    assert _ids("debe recibirse", lista) == ["a-uno"]


def test_check_prohibited_terms_con_dos_terminos_de_la_misma_clave_y_ninguno_igual_gana_el_primero() -> (
    None
):
    lista = _lista(a=[_termino("a-uno", "debe recibirlo"), _termino("a-dos", "debe recibirse")])

    assert _ids("debe recibir", lista) == ["a-uno"]


def test_check_prohibited_terms_reconoce_terminos_en_ingles() -> None:
    lista = _lista(a=[{"id": "en-should", "idioma": "en", "texto": "should receive"}])

    assert _ids("They SHOULD receive it", lista) == ["en-should"]


def test_check_prohibited_terms_ignora_el_nivel_b_por_defecto_y_lo_aplica_si_se_pide() -> None:
    lista = _lista()

    assert _ids("Opción recomendada", lista) == []
    assert _ids("Opción recomendada", lista, niveles=("A", "B")) == ["b-recomend"]


def test_check_prohibited_terms_el_prefijo_coincide_con_una_palabra_base_que_empieza_por_el_prefijo() -> (
    None
):
    lista = _lista()

    assert _ids(
        "recomienda",
        _lista(prefijos=[{"id": "p", "idioma": "es", "prefijo": "recomiend"}]),
        niveles=("B",),
    ) == ["p"]
    assert _ids("irrecomendable", lista, niveles=("B",)) == []


def test_check_prohibited_terms_aplica_terminos_de_nivel_b_de_dos_palabras() -> None:
    lista = _lista(b=[{"id": "en-switch", "idioma": "en", "texto": "switch to"}])

    assert _ids("Consider a switch to X", lista, niveles=("B",)) == ["en-switch"]


def test_check_prohibited_terms_una_frase_permitida_solo_se_ignora_con_permitir_frases() -> None:
    lista = _lista(
        a=[_termino("a-nc", "no constituye una recomendacion")],
        frases=["no constituye una recomendación"],
    )
    texto = "Esto no constituye una recomendación."

    assert _ids(texto, lista) == ["a-nc"]
    assert _ids(texto, lista, permitir_frases=True) == []


def test_check_prohibited_terms_una_frase_permitida_rompe_las_secuencias_que_la_cruzan() -> None:
    lista = _lista(a=[_termino("a-ini", "iniciar sesion ahora")], frases=["iniciar sesión"])

    assert _ids("iniciar sesión ahora", lista) == ["a-ini"]
    assert _ids("iniciar sesión ahora", lista, permitir_frases=True) == []


def test_check_prohibited_terms_con_formas_solo_coinciden_las_formas_listadas() -> None:
    lista = _lista(a=[_termino("a-admin", "administrar", formas=["administrar", "administre"])])

    assert _ids("administre trastuzumab", lista) == ["a-admin"]
    assert _ids("se administra trastuzumab", lista) == []


def test_check_prohibited_terms_una_excepcion_que_contiene_el_tramo_anula_la_coincidencia() -> None:
    lista = _lista(a=[_termino("a-se-debe", "se debe", excepciones=["se debe a"])])

    assert _ids("se debe a la dosis", lista) == []
    assert _ids("se debe revisar", lista) == ["a-se-debe"]


def test_check_prohibited_terms_prefiere_el_tramo_mas_largo_sin_solapes() -> None:
    lista = _lista(a=[_termino("a-debe", "debe recibir"), _termino("a-no-debe", "no debe recibir")])

    assert _ids("no debe recibir", lista) == ["a-no-debe"]


def test_check_prohibited_terms_devuelve_las_coincidencias_en_orden_de_aparicion() -> None:
    lista = _lista(a=[_termino("a-uno", "debe recibir"), _termino("a-dos", "el mejor tratamiento")])

    assert _ids("el mejor tratamiento: debe recibir", lista) == ["a-dos", "a-uno"]


@pytest.mark.parametrize(
    "cambio",
    [
        {"version": "1.0"},
        {"a": []},
        {"prefijos": []},
        {"a": [_termino("x", "uno"), _termino("x", "dos")]},
        {"b": [_termino("a-debe", "otro")]},
        {"a": [_termino("a", "debe recibir", formas=["otra cosa"])]},
        {"a": [_termino("a", "debe recibir", excepciones=["algo ajeno"])]},
    ],
)
def test_lista_terminos_rechaza_listas_invalidas(cambio: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        _lista(**cambio)
