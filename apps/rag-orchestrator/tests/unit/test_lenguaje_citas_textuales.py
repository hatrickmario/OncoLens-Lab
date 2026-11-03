"""Reglas puras de la voz propia y de la cita textual atribuida (US-249, RN-23, RN-04, RN-25): sin adapters."""

from __future__ import annotations

import json

import pytest

from app.domain.lenguaje import (
    FuenteCitada,
    ListaTerminos,
    check_prohibited_terms,
    tapar_citas_textuales_del_corpus,
)
from app.domain.support import coincidencias_en_campo_generado
from tests.support.contract import CATALOGOS

TITULO = "Guía de prueba (test)"
CITA = "The guideline recommends adding anti-HER2 therapy"
FUENTE = FuenteCitada(TITULO, f"{CITA} to adjuvant chemotherapy.")


def _lista() -> ListaTerminos:
    return ListaTerminos.model_validate(
        json.loads(
            (CATALOGOS / "lenguaje" / "terminos-prohibidos.json").read_text(encoding="utf-8")
        )
    )


def _ids(texto: str, fuentes: tuple[FuenteCitada, ...] = (), campo="rationale") -> list[str]:
    return [c.id for c in coincidencias_en_campo_generado(texto, campo, _lista(), fuentes)]


@pytest.mark.parametrize(
    "comillas", [("«", "»"), ('"', '"'), ("“", "”")], ids=["angulares", "rectas", "tipograficas"]
)
def test_tapar_citas_tapa_el_tramo_cuando_esta_atribuido_y_es_literal_de_la_fuente(
    comillas: tuple[str, str],
) -> None:
    abre, cierra = comillas

    tapado = tapar_citas_textuales_del_corpus(f"Según {TITULO}: {abre}{CITA}{cierra}", (FUENTE,))

    assert "recommends" not in tapado


def test_tapar_citas_no_tapa_nada_cuando_no_hay_fuentes() -> None:
    texto = f'Según {TITULO}: "{CITA}"'

    assert tapar_citas_textuales_del_corpus(texto, ()) == texto


def test_tapar_citas_no_tapa_cuando_las_comillas_no_traen_la_atribucion() -> None:
    texto = f'La fuente dice: "{CITA}"'

    assert tapar_citas_textuales_del_corpus(texto, (FUENTE,)) == texto


def test_tapar_citas_no_tapa_cuando_el_titulo_atribuido_no_es_el_de_la_fuente() -> None:
    texto = f'Según otra guía: "{CITA}"'

    assert tapar_citas_textuales_del_corpus(texto, (FUENTE,)) == texto


def test_tapar_citas_no_tapa_cuando_el_tramo_no_es_literal_de_la_fuente() -> None:
    texto = f'Según {TITULO}: "The guideline recommends stopping anti-HER2 therapy"'

    assert tapar_citas_textuales_del_corpus(texto, (FUENTE,)) == texto


def test_tapar_citas_tolera_mayusculas_y_puntuacion_del_tramo_literal() -> None:
    texto = f'SEGÚN {TITULO} : "the GUIDELINE recommends, adding anti-her2 therapy."'

    assert "recommends" not in tapar_citas_textuales_del_corpus(texto, (FUENTE,))


def test_tapar_citas_no_tapa_un_tramo_que_solo_es_subcadena_de_una_palabra_de_la_fuente() -> None:
    fuente = FuenteCitada(TITULO, "The guideline recommendsx adding therapy.")

    texto = f'Según {TITULO}: "guideline recommends"'

    assert tapar_citas_textuales_del_corpus(texto, (fuente,)) == texto


def test_tapar_citas_ignora_una_fuente_sin_titulo() -> None:
    texto = f'Según : "{CITA}"'

    assert tapar_citas_textuales_del_corpus(texto, (FuenteCitada("  ", FUENTE.texto),)) == texto


def test_coincidencias_aplica_el_subconjunto_b_cuando_la_afirmacion_atribuye_sin_comillas() -> None:
    assert _ids("The guideline recommends adding anti-HER2 therapy") == ["b-recommend"]


def test_coincidencias_no_aplica_el_resto_del_nivel_b_cuando_el_texto_es_descriptivo() -> None:
    assert _ids("Los ensayos evaluaron administrar trastuzumab durante un año") == []


def test_coincidencias_no_cuenta_el_sustantivo_recomendacion_cuando_describe() -> None:
    assert _ids("Los autores del ensayo no emiten una recomendación formal") == []
    assert _ids("The panel issued no recommendation for this setting") == []


def test_coincidencias_permite_la_cita_atribuida_cuando_esta_en_la_fuente_citada() -> None:
    assert _ids(f'Según {TITULO}: "{CITA}"', (FUENTE,)) == []


def test_coincidencias_rechaza_la_cita_atribuida_cuando_la_fuente_no_esta_entre_las_citadas() -> (
    None
):
    assert _ids(f'Según {TITULO}: "{CITA}"') == ["b-recommend"]


def test_coincidencias_no_habilita_el_nivel_a_dentro_de_la_cita_atribuida() -> None:
    fuente = FuenteCitada(TITULO, "The patient debe recibir the combination.")

    ids = _ids(f'Según {TITULO}: "The patient debe recibir the combination"', (fuente,))

    assert ids == ["es-debe-recibir"]


def test_coincidencias_conserva_un_termino_fuera_de_la_cita_cuando_la_cita_si_esta_tapada() -> None:
    texto = f'Según {TITULO}: "{CITA}". Se recomendaría iniciar'

    assert _ids(texto, (FUENTE,)) == ["es-se-recomendaria"]


def test_coincidencias_no_revisa_un_campo_copiado_del_corpus() -> None:
    assert _ids("Se recomendaría iniciar", campo="chunkTextSnapshot") == []  # type: ignore[arg-type]


def test_reglas_para_salida_generada_declara_el_nivel_a_y_los_ids_del_subconjunto_b() -> None:
    reglas = _lista().reglas_para_salida_generada()

    assert reglas.niveles == ("A", "B")
    assert reglas.ids_nivel_b == {"b-recomend", "b-recomiend", "b-recommend"}
    assert "no emite una recomendación" in reglas.excepciones_nivel_b


def test_check_prohibited_terms_no_cuenta_una_palabra_de_excepciones_b_cuando_empieza_por_el_prefijo() -> (
    None
):
    lista = _lista()
    texto = "no emiten una recomendación"

    con = check_prohibited_terms(
        texto, lista, niveles=("A", "B"), excepciones_b=["no emiten una recomendación"]
    )
    sin = check_prohibited_terms(texto, lista, niveles=("A", "B"))

    assert [c.id for c in con] == []
    assert [c.id for c in sin] == ["b-recomend"]
