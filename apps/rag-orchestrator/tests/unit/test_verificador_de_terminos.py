"""Adapter de `ProhibitedTermsChecker` y coherencia de `CAMPOS_GENERADOS` (L1D-180, tareas 2.11 y 2.12, RN-23)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import get_args

import pytest

from app.domain.support import CAMPOS_GENERADOS, CampoGenerado
from app.infrastructure.lenguaje.terminos_prohibidos import (
    ListaDeTerminosNoDisponible,
    cargar_verificador_de_terminos,
)
from tests.support.contract import CATALOGOS, RAIZ_REPOSITORIO

ORIGEN_DE_CAMPOS = RAIZ_REPOSITORIO / "packages" / "clinical-language" / "origen-de-campos.json"
LISTA = CATALOGOS / "lenguaje" / "terminos-prohibidos.json"


@pytest.fixture(scope="module")
def verificador():
    return cargar_verificador_de_terminos(CATALOGOS)


def test_declara_la_version_de_la_lista_cargada(verificador) -> None:
    assert verificador.version == json.loads(LISTA.read_text(encoding="utf-8"))["version"]


def test_devuelve_el_id_de_la_regla_coincidente_en_un_campo_generado(verificador) -> None:
    assert verificador.reglas_coincidentes("recomendado para este paciente", "rationale") == (
        "es-recomendado-para-este-paciente",
    )


def test_no_devuelve_reglas_cuando_el_texto_no_incumple(verificador) -> None:
    assert verificador.reglas_coincidentes("La evidencia describe una opción.", "option") == ()


@pytest.mark.parametrize("campo", CAMPOS_GENERADOS)
def test_revisa_todos_los_campos_generados(verificador, campo: str) -> None:
    assert verificador.reglas_coincidentes("El paciente debe recibir quimioterapia.", campo)


@pytest.mark.parametrize("campo", ["chunkTextSnapshot", "title", "sourceName", "citedSources"])
def test_no_revisa_los_campos_copiados_del_corpus_aunque_traigan_vocabulario_de_la_lista(
    verificador, campo: str
) -> None:
    assert verificador.reglas_coincidentes("Patients should receive adjuvant therapy.", campo) == ()  # type: ignore[arg-type]


def test_no_repite_una_regla_que_coincide_dos_veces_en_el_mismo_texto(verificador) -> None:
    reglas = verificador.reglas_coincidentes(
        "recomendado para este paciente y recomendado para este paciente", "rationale"
    )

    assert reglas == ("es-recomendado-para-este-paciente",)


def test_la_carga_falla_sin_la_ruta_cuando_la_lista_no_existe(tmp_path: Path) -> None:
    with pytest.raises(ListaDeTerminosNoDisponible) as error:
        cargar_verificador_de_terminos(tmp_path)

    assert str(tmp_path) not in str(error.value)


def test_la_carga_falla_cuando_la_lista_no_es_valida(tmp_path: Path) -> None:
    (tmp_path / "lenguaje").mkdir()
    (tmp_path / "lenguaje" / "terminos-prohibidos.json").write_text('{"version": "x"}')

    with pytest.raises(ListaDeTerminosNoDisponible):
        cargar_verificador_de_terminos(tmp_path)


def _campos_generados_del_origen(ruta: Path) -> set[str]:
    return set(json.loads(ruta.read_text(encoding="utf-8"))["camposGenerados"])


def test_campos_generados_es_igual_a_los_de_origen_generado_de_origen_de_campos_json() -> None:
    assert set(CAMPOS_GENERADOS) == _campos_generados_del_origen(ORIGEN_DE_CAMPOS)


def test_la_coherencia_se_rompe_cuando_se_altera_el_archivo_de_origen(tmp_path: Path) -> None:
    contenido = json.loads(ORIGEN_DE_CAMPOS.read_text(encoding="utf-8"))
    contenido["camposGenerados"].append("campoNuevo")
    alterado = tmp_path / "origen-de-campos.json"
    alterado.write_text(json.dumps(contenido), encoding="utf-8")

    assert set(CAMPOS_GENERADOS) != _campos_generados_del_origen(alterado)


def test_campos_generados_es_igual_a_los_valores_del_tipo_campo_generado() -> None:
    assert CAMPOS_GENERADOS == get_args(CampoGenerado)


def test_los_campos_copiados_del_corpus_no_estan_entre_los_generados() -> None:
    copiados = set(
        json.loads(ORIGEN_DE_CAMPOS.read_text(encoding="utf-8"))["camposCopiadosDelCorpus"]
    )

    assert copiados.isdisjoint(CAMPOS_GENERADOS)
