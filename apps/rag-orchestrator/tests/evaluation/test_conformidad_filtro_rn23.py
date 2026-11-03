"""Conformidad del filtro de producción de RN-23 sobre fx-rn23 2 (US-249 AC-3): cada caso por forma y variante.

Cada caso pasa por el MISMO adapter de producción (``VerificadorDeTerminosProhibidos``) con la lista 1.6.0 montada. La
atribución de la cita textual usa el título del catálogo (RN-25) en TODOS los campos generados (``CAMPOS_GENERADOS``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest
import yaml

from app.domain.lenguaje import FuenteCitada
from app.domain.support import CAMPOS_GENERADOS
from app.evaluation.lenguaje_linea_base import verificador_de_la_linea_base
from app.infrastructure.lenguaje.terminos_prohibidos import cargar_verificador_de_terminos
from tests.evaluation.conftest import RAIZ_REPO

FX = RAIZ_REPO / "data" / "eval" / "fx-rn23"
CATALOGOS = RAIZ_REPO / "packages" / "clinical-catalogs"
LINEA_BASE = FX / "linea-base" / "terminos-prohibidos-1.5.0.json"
FORMAS_CON_POSITIVOS_Y_NEGATIVOS = ("condicional", "impersonal", "imperativo", "nivel_b_atribuido")
VARIANTES_CON_POSITIVO = ("numero", "genero", "negacion")


@dataclass(frozen=True)
class Caso:
    id: str
    forma: str
    variante: str
    campo: str
    texto: str
    cita: str | None
    esperado: str
    regla: str | None

    @property
    def etiqueta(self) -> str:
        return f"{self.id} [forma={self.forma}, variante={self.variante}, campo={self.campo}]"


def _leer(nombre: str) -> dict[str, Any]:
    return yaml.safe_load((FX / nombre).read_text(encoding="utf-8"))  # type: ignore[no-any-return]


def _casos() -> list[Caso]:
    return [
        Caso(
            c["id"],
            c["forma"],
            c["variante"],
            c["campo"],
            c["texto"],
            c.get("cita"),
            c["esperado"],
            c.get("regla"),
        )
        for c in _leer("conformidad.yaml")["casos"]
    ]


def _fuente_de(chunk_id: str | None) -> tuple[FuenteCitada, ...]:
    """El título del catálogo del documento y el texto del chunk que cita la opción (RN-25, RN-04)."""
    if chunk_id is None:
        return ()
    corpus = _leer("corpus.yaml")
    chunk = next(c for c in corpus["chunks"] if c["id"] == chunk_id)
    titulo = next(d["titulo"] for d in corpus["documentos"] if d["id"] == chunk["documento"])
    return (FuenteCitada(titulo, chunk["texto"]),)


def _por_campo(casos: list[Caso]) -> list[tuple[Caso, str]]:
    return [
        (caso, campo)
        for caso in casos
        for campo in (CAMPOS_GENERADOS if caso.campo == "todos" else (caso.campo,))
    ]


def _incumplimientos(verificador: Any, casos: list[Caso]) -> list[str]:
    """Todos los casos se evalúan; cada fallo nombra el id, la forma, la variante y el campo (nunca el texto)."""
    fallos: list[str] = []
    for caso, campo in _por_campo(casos):
        reglas = verificador.reglas_coincidentes(caso.texto, campo, _fuente_de(caso.cita))
        cumple = (caso.regla in reglas) if caso.esperado == "rechaza" else (reglas == ())
        if not cumple:
            fallos.append(
                f"{caso.id} [forma={caso.forma}, variante={caso.variante}, campo={campo}]"
                f" esperaba {caso.esperado}"
            )
    return fallos


@pytest.mark.ac("US-249", 3)
def test_el_filtro_de_produccion_rechaza_cada_positivo_y_acepta_cada_negativo_de_fx_rn23_2() -> (
    None
):
    verificador = cargar_verificador_de_terminos(CATALOGOS)

    assert _incumplimientos(verificador, _casos()) == []


def test_el_fallo_nombra_el_id_la_forma_y_la_variante_cuando_el_filtro_no_rechaza_un_positivo() -> (
    None
):
    """La suite detecta el filtro de US-068 (lista 1.5.0, solo Nivel A): la voz propia y lo atribuido se le escapan."""
    fallos = _incumplimientos(verificador_de_la_linea_base(LINEA_BASE), _casos())

    assert (
        "CF-COND-01 [forma=condicional, variante=base, campo=rationale] esperaba rechaza" in fallos
    )
    assert any(f.startswith("CF-IMP-02 [forma=impersonal, variante=numero") for f in fallos)
    assert any(f.startswith("CF-IMPER-03 [forma=imperativo, variante=negacion") for f in fallos)
    assert any(f.startswith("CF-B-05 [forma=nivel_b_atribuido, variante=genero") for f in fallos)
    assert len(fallos) > 4  # el resto de los casos se siguió evaluando


def test_la_conformidad_cubre_cada_forma_con_positivo_y_negativo_y_cada_variante_con_un_positivo() -> (
    None
):
    casos = _casos()

    for forma in FORMAS_CON_POSITIVOS_Y_NEGATIVOS:
        de_la_forma = [c for c in casos if c.forma == forma]
        assert any(c.esperado == "rechaza" for c in de_la_forma), f"{forma}: sin positivo"
        assert any(c.esperado == "acepta" for c in de_la_forma), f"{forma}: sin negativo"
    for variante in VARIANTES_CON_POSITIVO:
        assert any(c.variante == variante and c.esperado == "rechaza" for c in casos), variante
    formas = {c.forma for c in casos}
    assert {"cita_atribuida", "cita_sin_atribucion"} <= formas
    assert len({c.id for c in casos}) == len(casos)


def test_la_atribucion_de_la_cita_se_prueba_en_todos_los_campos_generados() -> None:
    casos = [c for c in _casos() if c.forma == "cita_atribuida"]

    assert casos and all(c.campo == "todos" for c in casos)
    assert {campo for _, campo in _por_campo(casos)} == set(CAMPOS_GENERADOS)
    assert {c.esperado for c in casos} == {"acepta", "rechaza"}
