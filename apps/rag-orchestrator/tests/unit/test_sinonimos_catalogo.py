"""Sinónimos del catálogo para deduplicar valores de población (US-242) y relación de cada texto (US-277, RN-27)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.domain.contexto_del_seguimiento import (
    ContextoDelSeguimiento,
    clasificar_contexto_del_seguimiento,
)
from app.domain.sinonimos import RelacionDeSinonimo
from app.domain.corpus_metadata.poblacion_seleccion import ValorPropuesto, deduplicar
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible
from app.infrastructure.catalogo_clinico.sinonimos import (
    cargar_formas_por_termino,
    cargar_sinonimos,
    cargar_terminos_por_tipo,
)
from tests.support.contract import CATALOGOS


def _escribir(raiz: Path, tipo: str, contenido: object) -> None:
    (raiz / tipo).mkdir(parents=True)
    (raiz / tipo / "sinonimos.json").write_text(json.dumps(contenido), encoding="utf-8")


def _texto(texto: str, relacion: str = "equivalente", idioma: str = "es") -> dict[str, str]:
    return {"texto": texto, "idioma": idioma, "relacion": relacion}


def _valor(valor: str, chunk: str) -> ValorPropuesto:
    return ValorPropuesto(valor, chunk, "elegibilidad")


def _catalogo_de_clase(raiz: Path) -> Path:
    _escribir(
        raiz,
        "mama",
        {
            "version": "1.0.0",
            "items": [
                {
                    "terminoCanonico": "Inhibidores de aromatasa",
                    "sinonimos": [
                        _texto("Aromatase inhibitor", "equivalente", "en"),
                        _texto("Letrozol", "miembro_de_clase"),
                        _texto("Terapia endocrina", "mas_amplio"),
                    ],
                }
            ],
        },
    )
    return raiz


def test_cargar_sinonimos_mapea_cada_sinonimo_y_el_canonico_al_termino_canonico_normalizado(
    tmp_path: Path,
) -> None:
    _escribir(
        tmp_path,
        "mama",
        {
            "version": "1.0.0",
            "items": [
                {
                    "terminoCanonico": "Postmenopausal women",
                    "sinonimos": [
                        _texto("Post-menopausal", "equivalente", "en"),
                        _texto("Mujeres posmenopáusicas"),
                    ],
                }
            ],
        },
    )

    mapa = cargar_sinonimos(tmp_path, ["mama"])

    assert mapa == {
        "postmenopausal women": "postmenopausal women",
        "post menopausal": "postmenopausal women",
        "mujeres posmenopausicas": "postmenopausal women",
    }


def test_cargar_sinonimos_deja_solo_los_canonicos_y_los_equivalentes_cuando_hay_otras_relaciones(
    tmp_path: Path,
) -> None:
    mapa = cargar_sinonimos(_catalogo_de_clase(tmp_path), ["mama"])

    assert mapa == {
        "inhibidores de aromatasa": "inhibidores de aromatasa",
        "aromatase inhibitor": "inhibidores de aromatasa",
    }


def test_cargar_formas_por_termino_da_todos_los_textos_con_cualquier_relacion(
    tmp_path: Path,
) -> None:
    formas = cargar_formas_por_termino(_catalogo_de_clase(tmp_path), ["mama"])

    assert formas == {
        "inhibidores de aromatasa": frozenset(
            {
                "inhibidores de aromatasa",
                "aromatase inhibitor",
                "letrozol",
                "terapia endocrina",
            }
        )
    }


def test_cargar_terminos_por_tipo_incluye_el_tipo_el_canonico_los_equivalentes_y_los_miembros_de_clase_pero_no_los_mas_amplios(
    tmp_path: Path,
) -> None:
    terminos = cargar_terminos_por_tipo(_catalogo_de_clase(tmp_path), ["mama"])

    assert terminos["mama"] == frozenset(
        {"mama", "inhibidores de aromatasa", "aromatase inhibitor", "letrozol"}
    )


def test_cargar_sinonimos_une_los_tipos_pedidos() -> None:
    assert cargar_sinonimos(CATALOGOS, ["mama", "prostata"]) is not None


@pytest.mark.parametrize(
    "contenido",
    [
        "{no es json",
        '{"items": [{"terminoCanonico": "a"}]}',
        "[]",
        '{"items": [{"terminoCanonico": "a", "sinonimos": [{"texto": "b", "idioma": "es"}]}]}',
        '{"items": [{"terminoCanonico": "a", "sinonimos": '
        '[{"texto": "b", "idioma": "es", "relacion": "relacionado"}]}]}',
    ],
    ids=["no_json", "sin_sinonimos", "no_objeto", "sin_relacion", "relacion_fuera_del_enum"],
)
def test_cargar_sinonimos_falla_sin_ruta_ni_contenido_cuando_el_archivo_no_es_valido(
    tmp_path: Path, contenido: str
) -> None:
    (tmp_path / "mama").mkdir()
    (tmp_path / "mama" / "sinonimos.json").write_text(contenido, encoding="utf-8")

    with pytest.raises(CatalogoNoDisponible) as fallo:
        cargar_sinonimos(tmp_path, ["mama"])

    assert str(tmp_path) not in str(fallo.value) and contenido not in str(fallo.value)


def test_cargar_formas_por_termino_deja_solo_las_relaciones_pedidas_cuando_se_filtra(
    tmp_path: Path,
) -> None:
    formas = cargar_formas_por_termino(
        _catalogo_de_clase(tmp_path),
        ["mama"],
        relaciones=(RelacionDeSinonimo.equivalente,),
    )

    assert formas == {
        "inhibidores de aromatasa": frozenset({"inhibidores de aromatasa", "aromatase inhibitor"})
    }


def test_cargar_formas_por_termino_falla_cuando_un_sinonimo_no_declara_relacion(
    tmp_path: Path,
) -> None:
    _escribir(
        tmp_path,
        "mama",
        {"items": [{"terminoCanonico": "a", "sinonimos": [{"texto": "b", "idioma": "es"}]}]},
    )

    with pytest.raises(CatalogoNoDisponible):
        cargar_formas_por_termino(tmp_path, ["mama"])


def test_cargar_sinonimos_falla_cuando_falta_el_archivo(tmp_path: Path) -> None:
    with pytest.raises(CatalogoNoDisponible):
        cargar_sinonimos(tmp_path, ["mama"])


# --- no regresión de los demás consumidores (US-277 design D2) --------------------------------------------------------


@pytest.mark.ac("US-277", 1)
def test_un_miembro_de_clase_no_se_deduplica_con_su_clase_en_los_valores_de_poblacion(
    tmp_path: Path,
) -> None:
    sinonimos = cargar_sinonimos(_catalogo_de_clase(tmp_path), ["mama"])
    clase, miembro, equivalente = (
        _valor("inhibidores de aromatasa", "c1"),
        _valor("letrozol", "c2"),
        _valor("aromatase inhibitor", "c3"),
    )

    assert deduplicar([clase, miembro, equivalente], sinonimos) == (clase, miembro)


def test_los_terminos_de_pertinencia_del_catalogo_real_reconocen_un_miembro_de_clase_como_del_tipo() -> (
    None
):
    terminos = cargar_terminos_por_tipo(CATALOGOS, ["prostata"])["prostata"]

    assert {"abiraterona", "castracion medica", "implante de semillas"} <= terminos


def test_la_reescritura_del_catalogo_real_no_admite_un_miembro_de_clase_ni_un_texto_mas_amplio() -> (
    None
):
    admitidos = cargar_sinonimos(CATALOGOS, ["prostata"])

    assert "castracion medica" not in admitidos and "observacion" not in admitidos
    assert admitidos["androgen deprivation therapy"] == "terapia de privacion androgenica"


def test_un_texto_mas_amplio_de_prostata_no_vuelve_fuera_de_contexto_una_pregunta_de_mama() -> None:
    terminos = cargar_terminos_por_tipo(CATALOGOS, ["mama", "prostata"])

    assert "observacion" not in terminos["prostata"]
    assert (
        clasificar_contexto_del_seguimiento(
            "¿Qué dice la evidencia sobre la observación tras la cirugía?", "mama", terminos
        )
        is ContextoDelSeguimiento.en_contexto
    )


def test_las_relaciones_del_enum_de_python_son_las_del_esquema_del_catalogo() -> None:
    esquema = json.loads(
        (CATALOGOS / "schemas" / "sinonimos.schema.json").read_text(encoding="utf-8")
    )
    relacion = esquema["properties"]["items"]["items"]["properties"]["sinonimos"]["items"][
        "properties"
    ]["relacion"]

    assert {r.value for r in RelacionDeSinonimo} == set(relacion["enum"])
