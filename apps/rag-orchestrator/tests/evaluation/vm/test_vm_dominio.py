"""Reglas puras del baseline de VM-1 y VM-2 (US-075): manifiesto, filas, validación ciega y medianas."""

from __future__ import annotations

import copy
import csv
import json

import pytest

from app.evaluation.vm.dominio import (
    COLUMNAS,
    medianas_por_tipo,
    pares_para_validacion,
    validar_cabecera,
    validar_coherencia_validacion,
    validar_fila_sesion,
    validar_manifiesto,
    validar_registro,
)
from tests.evaluation.conftest import RAIZ_REPO
from tests.evaluation.vm.constructores import (
    CASOS,
    CONFIG,
    FIXTURES,
    fila,
    manifiesto_con,
    manifiesto_valido,
)


def _siempre(_ruta: str) -> bool:
    return True


def _filas_de_fixture() -> list[dict[str, str]]:
    with (FIXTURES / "sesiones-medianas.csv").open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


# --- manifiesto (AC-1) ---------------------------------------------------------------------------


def test_manifiesto_valido_no_produce_errores() -> None:
    assert validar_manifiesto(manifiesto_valido(), _siempre) == []


@pytest.mark.ac("US-075", 1)
def test_manifiesto_real_declara_sintetico_con_tres_casos_por_tipo_y_solo_falta_la_validacion_clinica() -> (
    None
):
    """[US-075 AC-1] el manifiesto declara clase sintetico con ≥ 3 casos por tipo y checklist completo."""
    raiz = RAIZ_REPO / "data" / "evaluation" / "vm-baseline"
    manifiesto = json.loads((raiz / "manifest.json").read_text(encoding="utf-8"))

    errores = validar_manifiesto(manifiesto, lambda ruta: (raiz / ruta).is_file())

    tipos = [c["tipo_cancer"] for c in manifiesto["casos"]]
    assert manifiesto["clase"] == "sintetico"
    assert tipos.count("mama") >= 3 and tipos.count("prostata") >= 3
    # La fecha de validación clínica la registra el usuario tras la validación humana (tarea 3.1).
    assert errores and all("fecha_validacion_clinica" in e for e in errores)


def test_rechaza_el_manifiesto_cuando_no_declara_clase_sintetico() -> None:
    manifiesto = manifiesto_valido()
    manifiesto["clase"] = "real"

    assert any("clase" in e for e in validar_manifiesto(manifiesto, _siempre))


def test_rechaza_el_manifiesto_cuando_hay_menos_de_tres_casos_por_tipo() -> None:
    manifiesto = manifiesto_valido()
    manifiesto["casos"] = [c for c in manifiesto["casos"] if c["id"] != "prostata-03"]

    assert any("prostata" in e for e in validar_manifiesto(manifiesto, _siempre))


def test_rechaza_el_manifiesto_cuando_un_documento_declarado_no_existe() -> None:
    errores = validar_manifiesto(manifiesto_valido(), lambda ruta: "mama-01" not in ruta)

    assert any("mama-01" in e and "documento" in e for e in errores)


@pytest.mark.ac("US-075", 1)
@pytest.mark.parametrize(
    "quitar", ["criticos", "complementarios", "version", "fecha_validacion_clinica"]
)
def test_rechaza_el_manifiesto_cuando_un_checklist_no_separa_criticos_y_complementarios_o_le_falta_version_o_fecha(
    quitar: str,
) -> None:
    """[US-075 AC-1] el checklist sin críticos, complementarios, versión o fecha de validación se rechaza."""
    caso = copy.deepcopy(manifiesto_valido()["casos"][0])
    del caso["checklist_reconstruccion"][quitar]

    errores = validar_manifiesto(manifiesto_con("mama-01", **caso), _siempre)

    assert any("mama-01" in e and quitar in e for e in errores)


def test_rechaza_el_manifiesto_cuando_la_fecha_de_validacion_clinica_no_tiene_formato_aaaa_mm_dd() -> (
    None
):
    caso = copy.deepcopy(manifiesto_valido()["casos"][0])
    caso["checklist_reconstruccion"]["fecha_validacion_clinica"] = "16/10/2026"

    errores = validar_manifiesto(manifiesto_con("mama-01", **caso), _siempre)

    assert any("fecha_validacion_clinica" in e for e in errores)


def test_rechaza_el_manifiesto_cuando_a_los_criticos_les_falta_un_eje() -> None:
    caso = copy.deepcopy(manifiesto_valido()["casos"][0])
    caso["checklist_reconstruccion"]["criticos"] = [
        c for c in caso["checklist_reconstruccion"]["criticos"] if c["eje"] != "biomarcadores"
    ]

    errores = validar_manifiesto(manifiesto_con("mama-01", **caso), _siempre)

    assert any("mama-01" in e and "biomarcadores" in e for e in errores)


@pytest.mark.ac("US-075", 1)
@pytest.mark.parametrize(
    "campo", ["poblacion", "contexto_clinico", "decision", "fecha_corte_evidencia"]
)
def test_rechaza_el_manifiesto_cuando_la_pregunta_de_referencia_no_declara_un_campo(
    campo: str,
) -> None:
    """[US-075 AC-1] población, contexto, decisión y fecha de corte son obligatorios."""
    caso = copy.deepcopy(manifiesto_valido()["casos"][0])
    del caso["pregunta_referencia"][campo]

    errores = validar_manifiesto(manifiesto_con("mama-01", **caso), _siempre)

    assert any("mama-01" in e and campo in e for e in errores)


def test_rechaza_el_manifiesto_cuando_el_texto_de_la_pregunta_no_incluye_la_fecha_de_corte() -> (
    None
):
    caso = copy.deepcopy(manifiesto_valido()["casos"][0])
    caso["pregunta_referencia"]["texto"] = "Pregunta sin fecha"

    errores = validar_manifiesto(manifiesto_con("mama-01", **caso), _siempre)

    assert any("mama-01" in e and "texto" in e for e in errores)


# --- cabecera y filas (AC-2) ---------------------------------------------------------------------


def test_acepta_la_cabecera_cuando_es_exactamente_el_conjunto_declarado() -> None:
    assert validar_cabecera(list(COLUMNAS)) == []


@pytest.mark.ac("US-075", 2)
@pytest.mark.parametrize("extra", ["notas", "fecha_sesion", "justificacion"])
def test_rechaza_el_csv_nombrando_la_columna_sin_repetir_su_contenido_cuando_trae_una_columna_no_declarada(
    extra: str,
) -> None:
    """[US-075 AC-2] una columna no declarada (notas, fecha_sesion) se rechaza por su nombre."""
    errores = validar_cabecera([*COLUMNAS, extra])

    assert errores and extra in errores[0]


def test_rechaza_el_csv_cuando_falta_una_columna_declarada() -> None:
    errores = validar_cabecera([c for c in COLUMNAS if c != "validada"])

    assert errores and "validada" in errores[0]


def test_acepta_la_fila_cuando_cumple_todas_las_reglas() -> None:
    assert validar_fila_sesion(fila(), 2, set(CASOS), CONFIG) == []


@pytest.mark.ac("US-075", 2)
def test_rechaza_la_fila_sin_repetir_el_valor_cuando_el_participante_no_es_un_seudonimo() -> None:
    """[US-075 AC-2] un nombre en participante se rechaza nombrando fila y regla, sin repetirlo."""
    errores = validar_fila_sesion(fila(participante="Maria Gomez"), 4, set(CASOS), CONFIG)

    assert errores and "fila 4" in errores[0] and "seudónimo O<n>" in errores[0]
    assert all("Maria" not in e and "Gomez" not in e for e in errores)


@pytest.mark.ac("US-075", 2)
@pytest.mark.parametrize(
    ("cambio", "columna"),
    [
        ({"tiempo_evidencia_min": ""}, "tiempo_evidencia_min"),
        ({"tiempo_reconstruccion_min": ""}, "tiempo_reconstruccion_min"),
        ({"caso": "mama-99"}, "caso"),
    ],
)
def test_rechaza_la_fila_cuando_falta_un_tiempo_o_el_caso_no_esta_en_el_manifiesto(
    cambio: dict[str, str], columna: str
) -> None:
    """[US-075 AC-2]"""
    errores = validar_fila_sesion(fila(**cambio), 3, set(CASOS), CONFIG)

    assert errores and "fila 3" in errores[0] and columna in errores[0]


@pytest.mark.ac("US-075", 2)
@pytest.mark.parametrize("columna", ["tiempo_reconstruccion_min", "tiempo_evidencia_min"])
def test_rechaza_la_fila_cuando_un_tiempo_supera_los_30_min_de_vm_session_max_minutes(
    columna: str,
) -> None:
    """[US-075 AC-2] t > 30 se rechaza sin repetir el valor."""
    errores = validar_fila_sesion(
        fila(**{columna: "31", "reconstruido": "no", "autoidentificada": "no", "fuente_id": ""}),
        5,
        set(CASOS),
        CONFIG,
    )

    assert errores and columna in errores[0] and "VM_SESSION_MAX_MINUTES" in errores[0]
    assert all("31" not in e.replace("fila 5", "") for e in errores)


def test_rechaza_la_fila_cuando_un_tiempo_es_cero_o_negativo() -> None:
    errores = validar_fila_sesion(fila(tiempo_evidencia_min="0"), 2, set(CASOS), CONFIG)

    assert errores and "tiempo_evidencia_min" in errores[0]


@pytest.mark.ac("US-075", 2)
def test_cuenta_como_no_completada_la_tarea_que_alcanza_vm_session_max_minutes_y_evalua_la_otra_por_separado() -> (
    None
):
    """[US-075 AC-2] VM-1 en 30 min con reconstruido=no se acepta; VM-2 de la misma fila va aparte."""
    f = fila(
        tiempo_reconstruccion_min="30", reconstruido="no", tiempo_evidencia_min="9", validada="si"
    )

    assert validar_fila_sesion(f, 2, set(CASOS), CONFIG) == []
    medianas = medianas_por_tipo([f], manifiesto_valido(), 30)
    assert medianas["vm1"]["mama"] == 30.0
    assert medianas["vm2_autoidentificada"]["mama"] == 9.0


@pytest.mark.parametrize(
    ("cambio", "regla"),
    [
        ({"tiempo_reconstruccion_min": "30", "reconstruido": "si"}, "reconstruccion"),
        ({"tiempo_evidencia_min": "30", "autoidentificada": "si"}, "evidencia"),
    ],
)
def test_rechaza_la_fila_cuando_la_tarea_alcanza_el_maximo_con_desenlace_si(
    cambio: dict[str, str], regla: str
) -> None:
    errores = validar_fila_sesion(fila(**cambio), 2, set(CASOS), CONFIG)

    assert any("queda no completada" in e for e in errores)


@pytest.mark.ac("US-075", 2)
@pytest.mark.parametrize("libre", ["ver el articulo de la guia", "ESMO guia 2024", "x" * 129])
def test_rechaza_la_fila_sin_repetir_el_valor_cuando_fuente_id_trae_texto_libre(libre: str) -> None:
    """[US-075 AC-2] fuente_id solo admite VM_SOURCE_ID_PATTERN; el mensaje no cita el valor."""
    errores = validar_fila_sesion(fila(fuente_id=libre), 6, set(CASOS), CONFIG)

    assert errores and "fuente_id" in errores[0]
    assert all(libre not in e for e in errores)


def test_rechaza_la_fila_cuando_autoidentificada_es_no_y_trae_fuente_id() -> None:
    f = fila(autoidentificada="no", validada="no", fuente_id="PMID:1")

    assert any("fuente_id" in e for e in validar_fila_sesion(f, 2, set(CASOS), CONFIG))


def test_rechaza_la_fila_cuando_autoidentificada_es_si_y_falta_fuente_id() -> None:
    assert any(
        "fuente_id" in e for e in validar_fila_sesion(fila(fuente_id=""), 2, set(CASOS), CONFIG)
    )


def test_rechaza_la_fila_cuando_la_condicion_no_es_manual() -> None:
    errores = validar_fila_sesion(fila(condicion="oncolens"), 2, set(CASOS), CONFIG)

    assert errores and "condicion" in errores[0]


# --- validación ciega (AC-2) ---------------------------------------------------------------------


@pytest.mark.ac("US-075", 2)
def test_rechaza_la_fila_cuando_validada_es_si_con_autoidentificada_no() -> None:
    """[US-075 AC-2]"""
    errores = validar_coherencia_validacion(
        [fila(autoidentificada="no", fuente_id="", validada="si")]
    )

    assert any("validada" in e and "autoidentificada" in e for e in errores)


@pytest.mark.ac("US-075", 2)
def test_rechaza_la_fila_cuando_validada_esta_vacio_porque_la_validacion_esta_pendiente() -> None:
    """[US-075 AC-2]"""
    errores = validar_coherencia_validacion([fila(validada="")])

    assert any("fila 2" in e and "pendiente" in e for e in errores)


@pytest.mark.ac("US-075", 2)
def test_rechaza_la_fila_cuando_un_mismo_par_caso_fuente_tiene_veredictos_distintos() -> None:
    """[US-075 AC-2]"""
    errores = validar_coherencia_validacion(
        [fila(participante="O1", validada="si"), fila(participante="O2", validada="no")]
    )

    assert any("veredictos distintos" in e for e in errores)


def test_acepta_veredictos_iguales_para_el_mismo_par_caso_fuente() -> None:
    assert (
        validar_coherencia_validacion(
            [fila(participante="O1"), fila(participante="O2", tiempo_evidencia_min="20")]
        )
        == []
    )


def test_rechaza_el_registro_cuando_el_mismo_participante_repite_un_caso() -> None:
    errores = validar_registro([fila(), fila()], manifiesto_valido(), CONFIG)

    assert any("fila 3" in e and "duplicad" in e for e in errores)


@pytest.mark.ac("US-075", 2)
def test_lista_los_pares_caso_fuente_una_sola_vez_ordenados_y_sin_tiempo_ni_participante() -> None:
    """[US-075 AC-2] O1 y O2 citan la misma fuente en mama-01: el par sale una vez."""
    filas = [
        fila(participante="O2", caso="prostata-01", fuente_id="PMID:9"),
        fila(participante="O1", caso="mama-01", fuente_id="PMID:2"),
        fila(participante="O2", caso="mama-01", fuente_id="PMID:2"),
        fila(participante="O1", caso="mama-01", fuente_id="PMID:1"),
        fila(participante="O1", caso="mama-02", autoidentificada="no", fuente_id="", validada="no"),
    ]

    pares = pares_para_validacion(filas, manifiesto_valido())

    texto = {c["id"]: c["pregunta_referencia"]["texto"] for c in manifiesto_valido()["casos"]}
    assert pares == [
        ("mama-01", texto["mama-01"], "PMID:1"),
        ("mama-01", texto["mama-01"], "PMID:2"),
        ("prostata-01", texto["prostata-01"], "PMID:9"),
    ]


# --- medianas (AC-3) -----------------------------------------------------------------------------


@pytest.mark.ac("US-075", 3)
def test_calcula_mediana_de_vm1_mama_20_prostata_18_y_total_19_cuando_hay_tres_casos_por_tipo() -> (
    None
):
    """[US-075 AC-3] mama 10, 20, 30 (el último no reconstruido) y próstata 12, 18, 25."""
    medianas = medianas_por_tipo(_filas_de_fixture(), manifiesto_valido(), 30)

    assert medianas["vm1"] == {"mama": 20.0, "prostata": 18.0, "total": 19.0}


@pytest.mark.ac("US-075", 3)
def test_calcula_para_vm2_de_mama_mediana_autoidentificada_15_y_validada_30_cuando_solo_se_valida_un_intento() -> (
    None
):
    """[US-075 AC-3] los dos intentos no validados cuentan como no completados con el tiempo máximo."""
    medianas = medianas_por_tipo(_filas_de_fixture(), manifiesto_valido(), 30)

    assert medianas["vm2_autoidentificada"]["mama"] == 15.0
    assert medianas["vm2_validada"]["mama"] == 30.0
    assert medianas["vm2_validada"]["total"] == 23.0


def test_cuenta_el_tiempo_maximo_cuando_el_intento_no_es_autoidentificado_aunque_el_tiempo_sea_menor() -> (
    None
):
    f = fila(autoidentificada="no", fuente_id="", validada="no", tiempo_evidencia_min="12")

    medianas = medianas_por_tipo([f], manifiesto_valido(), 30)

    assert medianas["vm2_autoidentificada"]["mama"] == 30.0


def test_devuelve_none_cuando_no_hay_sesiones_de_un_tipo_de_cancer() -> None:
    medianas = medianas_por_tipo([fila()], manifiesto_valido(), 30)

    assert medianas["vm1"]["prostata"] is None
