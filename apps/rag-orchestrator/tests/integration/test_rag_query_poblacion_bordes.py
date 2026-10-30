"""Bordes de la población en lista de `/rag/query` (US-243 / L1D-293): log de conflicto, valores largos y catálogo de reglas.

Test después (tareas 3.2 y del lector del catálogo). Cada respuesta la valida contra el spec del proveedor el hook de
``verificacion_proveedor.py`` (US-214).
"""

import logging
import shutil
from pathlib import Path

import pytest

from app.application.respuesta_con_evidencia import _poblacion_en_lista
from app.domain.aplicabilidad_tipos import CriterioEvaluado, ValorDePoblacion
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible
from tests.support.catalogo_aplicabilidad import APL_1_0_0, APL_1_2_0
from tests.support.logs import exigir_sin_valores_prohibidos
from tests.support.poblacion_fx08bc import (
    FICHAS_FX08BC,
    POBLACIONES_FX08BC,
    entorno_fx08bc,
    solicitud_a_m2,
)
from tests.support.poblacion_lista import poblacion_guardada, valor_nuevo

TIPOS = ("mama", "prostata")


def test_rag_query_registra_poblacion_conflicto_con_criterio_chunk_y_trace_sin_valores_cuando_dos_fragmentos_se_excluyen(
    caplog,
):
    entorno = entorno_fx08bc("O-P4")
    caplog.set_level(logging.DEBUG)

    respuesta = entorno.consultar(solicitud_a_m2())

    assert respuesta.status_code == 200
    mensajes = [r.getMessage() for r in caplog.records]
    conflictos = [m for m in mensajes if "event=poblacion_conflicto" in m]
    assert len(conflictos) == 2
    assert all("criterio=estado_her2" in m and "traceId=" in m for m in conflictos)
    assert {m.split("chunkId=")[1].split()[0] for m in conflictos} == {"ch-b4-1", "ch-b4-2"}
    exigir_sin_valores_prohibidos(
        "\n".join(mensajes),
        ["HER2-positive", "HER2-negative", "Synthetic adjuvant study", solicitud_a_m2()["query"]],
    )


def test_rag_query_no_registra_poblacion_conflicto_cuando_ningun_criterio_esta_en_conflicto(caplog):
    entorno = entorno_fx08bc("O-P1")
    caplog.set_level(logging.DEBUG)

    entorno.consultar(solicitud_a_m2())

    assert not [r for r in caplog.records if "poblacion_conflicto" in r.getMessage()]


def test_rag_query_no_emite_el_valor_cuando_supera_el_maximo_del_contrato_y_responde_200():
    largo = "postmenopausal women " + "x" * 200
    poblaciones = {
        **POBLACIONES_FX08BC,
        "doc-b3": poblacion_guardada(
            "extraido_verificado", {"estado_menopausico": [valor_nuevo(largo, "ch-b3-1")]}
        ),
    }
    entorno = entorno_fx08bc("O-P3", poblaciones=poblaciones)

    respuesta = entorno.consultar(solicitud_a_m2())

    assert respuesta.status_code == 200
    externo = FICHAS_FX08BC["doc-b3"].external_id
    fuente = next(f for f in respuesta.json()["applicability"] if f["externalId"] == externo)
    menopausia = next(c for c in fuente["criteria"] if c["criterion"] == "estado_menopausico")
    assert "studyPopulationValues" not in menopausia


def test_el_catalogo_lee_marcadores_y_sinonimos_de_poblacion_reglas_cuando_el_archivo_existe():
    mama = cargar_criterios_de_aplicabilidad(APL_1_2_0, TIPOS).criterios("mama")

    menopausia = next(c for c in mama if c.clave == "estado_menopausico")
    assert set(menopausia.poblacion.marcadores_de_restriccion) == {
        "solo",
        "exclusivamente",
        "only",
        "exclusively",
    }
    assert "postmenopausal women" in menopausia.poblacion.sinonimos["postmenopausica"]
    assert next(c for c in mama if c.clave == "estadio").poblacion.escala == ()


def test_el_catalogo_no_reconoce_restriccion_ni_sinonimos_cuando_no_hay_poblacion_reglas():
    mama = cargar_criterios_de_aplicabilidad(APL_1_0_0, TIPOS).criterios("mama")

    assert all(not c.poblacion.marcadores_de_restriccion for c in mama)
    assert all(not c.poblacion.sinonimos for c in mama)


@pytest.mark.parametrize(
    "contenido",
    [
        '{"version": "x", "peso": 1}',
        "no es json",
        '{"version": "x", "criteria": {"a": {"scale": []}}}',
    ],
)
def test_el_catalogo_no_esta_disponible_cuando_poblacion_reglas_no_cumple_su_forma(
    tmp_path: Path, contenido: str
):
    catalogo = tmp_path / "test-apl-1.2.0"
    shutil.copytree(APL_1_2_0, catalogo)
    (catalogo / "mama" / "poblacion-reglas.json").write_text(contenido, encoding="utf-8")

    with pytest.raises(CatalogoNoDisponible) as error:
        cargar_criterios_de_aplicabilidad(catalogo, TIPOS)

    assert str(tmp_path) not in str(error.value)
    assert "peso" not in str(error.value)


def test_rag_query_no_fabrica_conflicto_en_la_fuente_cuando_dos_opciones_citan_fragmentos_distintos_del_mismo_documento(
    caplog,
):
    entorno = entorno_fx08bc("O-P7", "O-P8")
    caplog.set_level(logging.DEBUG)

    respuesta = entorno.consultar(solicitud_a_m2())

    assert respuesta.status_code == 200
    externo = FICHAS_FX08BC["doc-b7"].external_id
    fuente = next(f for f in respuesta.json()["applicability"] if f["externalId"] == externo)
    menopausia = next(c for c in fuente["criteria"] if c["criterion"] == "estado_menopausico")
    # La fuente muestra los criterios de la opción más aplicable que la cita (O-P7, coincide), nunca la unión.
    assert menopausia["status"] == "coincide"
    assert menopausia["unknownReason"] is None
    assert {v["chunkId"] for v in menopausia["studyPopulationValues"]} == {"ch-b7-1"}
    assert not [r for r in caplog.records if "poblacion_conflicto" in r.getMessage()]


def test_criterio_aplicable_no_emite_el_valor_de_la_forma_antigua_sin_fragmento_cuando_se_mezcla_con_la_lista():
    criterio = CriterioEvaluado(
        "estado_menopausico",
        "posmenopáusica",
        "postmenopausal women",
        "desconocido",
        "no_reportado_por_fuente",
        False,
        valores_del_estudio=(
            ValorDePoblacion("postmenopausal women", "elegibilidad", None),
            ValorDePoblacion("premenopausal women", "elegibilidad", "ch-1"),
        ),
    )

    campos = _poblacion_en_lista(criterio)

    assert [v.chunkId for v in campos["studyPopulationValues"]] == ["ch-1"]
