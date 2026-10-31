"""Sinónimos del catálogo para deduplicar valores de población (US-242, RN-27)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible
from app.infrastructure.catalogo_clinico.sinonimos import cargar_sinonimos
from tests.support.contract import CATALOGOS


def _escribir(raiz: Path, tipo: str, contenido: object) -> None:
    (raiz / tipo).mkdir(parents=True)
    (raiz / tipo / "sinonimos.json").write_text(json.dumps(contenido), encoding="utf-8")


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
                        {"texto": "Post-menopausal", "idioma": "en"},
                        {"texto": "Mujeres posmenopáusicas", "idioma": "es"},
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


def test_cargar_sinonimos_une_los_tipos_pedidos() -> None:
    assert cargar_sinonimos(CATALOGOS, ["mama", "prostata"]) is not None


@pytest.mark.parametrize(
    "contenido", ["{no es json", '{"items": [{"terminoCanonico": "a"}]}', "[]"]
)
def test_cargar_sinonimos_falla_sin_ruta_ni_contenido_cuando_el_archivo_no_es_valido(
    tmp_path: Path, contenido: str
) -> None:
    (tmp_path / "mama").mkdir()
    (tmp_path / "mama" / "sinonimos.json").write_text(contenido, encoding="utf-8")

    with pytest.raises(CatalogoNoDisponible) as fallo:
        cargar_sinonimos(tmp_path, ["mama"])

    assert str(tmp_path) not in str(fallo.value) and contenido not in str(fallo.value)


def test_cargar_sinonimos_falla_cuando_falta_el_archivo(tmp_path: Path) -> None:
    with pytest.raises(CatalogoNoDisponible):
        cargar_sinonimos(tmp_path, ["mama"])
