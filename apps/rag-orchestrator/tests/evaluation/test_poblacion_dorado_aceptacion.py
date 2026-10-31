"""Aceptación de la familia `poblacion` de `evaluate` (L1D-299, US-233b AC-2…AC-8), con adapters falsos.

El extractor es el de producción (``extractor_de_poblacion``) con el LLM y el NLI falsos que dicta el dorado; las reglas de
estado son las reales de US-243. Solo los modelos son dobles.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from app.evaluation.corrida_poblacion import MedicionSinEvidencia, PuertosDePoblacion
from app.evaluation.evaluate import main
from tests.evaluation.dorado_de_prueba import (
    DOCUMENTOS,
    ESTADOS,
    PARES,
    escribir_config,
    escribir_dorado,
    pares_del_bucle,
)
from tests.support.fakes import RelojFijo


def _correr(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    *,
    puertos: PuertosDePoblacion | None = None,
    config: dict[str, Any] | None = None,
    **dorado: Any,
) -> tuple[int, dict[str, Any] | None, str]:
    carpeta = escribir_dorado(tmp_path / "dorado", **dorado)
    ruta = escribir_config(tmp_path, carpeta, **(config or {}))
    salida = tmp_path / "salida"
    codigo = main(
        ["--config", str(ruta), "--suite", "poblacion", "--salida", str(salida)],
        reloj=RelojFijo(),
        puertos_poblacion=puertos or PuertosDePoblacion(medidor_sin_evidencia=_sin_evidencia_ok),
    )
    escritos = list(salida.glob("*.json")) if salida.exists() else []
    reporte = json.loads(escritos[0].read_text(encoding="utf-8")) if escritos else None
    return codigo, reporte, capsys.readouterr().err


def _sin_evidencia_ok(_config: Path) -> MedicionSinEvidencia:
    return MedicionSinEvidencia(exactitud=1.0, invocaciones_llm=0, top_relevance_no_nulos=0)


@pytest.mark.ac("US-233b", 2)
def test_poblacion_reporta_precision_cobertura_y_duplicados_por_criterio_con_la_configuracion_falsa(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Reporta precisión, cobertura y duplicados por criterio cuando se ejecuta la familia poblacion con la configuración
    falsa [US-233b AC-2]."""
    codigo, reporte, _ = _correr(tmp_path, capsys)

    assert codigo == 0 and reporte is not None
    criterios = {c["criterio"]: c for c in reporte["metricas"]["por_criterio"]}
    assert set(criterios) == {
        "estado_menopausico",
        "estado_her2",
        "receptores_hormonales",
        "linea_tratamiento",
    }
    assert criterios["estado_menopausico"]["precision"] == 1.0
    assert criterios["estado_menopausico"]["cobertura"] == 1.0
    assert criterios["estado_menopausico"]["meta_precision"] == 0.9
    assert reporte["metricas"]["tasa_duplicados"]["valor"] == 0.0


def test_poblacion_baja_la_precision_cuando_el_llm_propone_un_valor_que_el_dorado_no_espera(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    pares = copy.deepcopy(PARES)
    pares[1]["propuesta"] = [
        *pares[1]["esperados"],
        {"valor": "HER2-low", "scope": "mencion", "chunk": "ch-t1-1"},
    ]

    _, reporte, _ = _correr(tmp_path, capsys, pares=pares)

    assert reporte is not None
    her2 = {c["criterio"]: c for c in reporte["metricas"]["por_criterio"]}["estado_her2"]
    assert (her2["precision"], her2["cobertura"], her2["marca_precision"]) == (
        0.5,
        1.0,
        "fuera_de_meta",
    )


def test_poblacion_baja_la_cobertura_cuando_el_llm_omite_un_valor_esperado(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    pares = copy.deepcopy(PARES)
    pares[0]["propuesta"] = pares[0]["esperados"][:1]

    _, reporte, _ = _correr(tmp_path, capsys, pares=pares)

    assert reporte is not None
    menopausia = {c["criterio"]: c for c in reporte["metricas"]["por_criterio"]}[
        "estado_menopausico"
    ]
    assert (menopausia["precision"], menopausia["cobertura"]) == (1.0, 0.5)


def test_poblacion_no_escribe_valores_ni_fragmentos_en_el_reporte(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _correr(tmp_path, capsys)

    contenido = next((tmp_path / "salida").glob("*.json")).read_text(encoding="utf-8")
    textos = [f["texto"] for d in DOCUMENTOS.values() for f in d["fragmentos"]]
    valores = [e["valor"] for p in PARES for e in p["esperados"]]
    assert [t for t in textos + valores if t in contenido] == []


@pytest.mark.ac("US-233b", 3)
def test_poblacion_sale_con_codigo_distinto_de_cero_y_nombra_documento_y_criterio_cuando_una_tarea_termina_con_length(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Sale con código ≠ 0 y nombra documento y criterio cuando una tarea termina con finish_reason length
    [US-233b AC-3]."""
    pares = copy.deepcopy(PARES)
    pares[0]["corte"] = 2  # ambas llamadas (intento + reintento) se cortan

    codigo, reporte, error = _correr(tmp_path, capsys, pares=pares)

    assert codigo != 0
    assert "doc-t1" in error and "estado_menopausico" in error
    assert reporte is not None  # el reporte se escribe igualmente
    assert reporte["metricas"]["cortes_por_longitud"]["casos"] == [
        {"documento": "doc-t1", "criterio": "estado_menopausico"}
    ]
    leido = error + json.dumps(reporte)
    assert [
        f["texto"] for d in DOCUMENTOS.values() for f in d["fragmentos"] if f["texto"] in leido
    ] == []
    assert "premenopausal" not in leido


def test_poblacion_sale_con_codigo_cero_cuando_ninguna_tarea_termina_con_length(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo, reporte, _ = _correr(tmp_path, capsys)

    assert codigo == 0 and reporte is not None
    assert reporte["metricas"]["cortes_por_longitud"]["cortes"] == 0


@pytest.mark.ac("US-233b", 4)
def test_poblacion_cuenta_aparte_no_coincide_indebido_y_coincide_indebido_al_comparar_los_estados_f20_a_f24(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Cuenta aparte No coincide indebido y Coincide indebido cuando compara los estados esperados F-20…F-24
    [US-233b AC-4]."""
    codigo, reporte, _ = _correr(tmp_path, capsys)

    assert codigo == 0 and reporte is not None
    concordancia = reporte["metricas"]["concordancia"]
    assert (concordancia["aciertos"], concordancia["total"]) == (len(ESTADOS), len(ESTADOS))
    assert concordancia["no_coincide_indebido"] == 0
    assert concordancia["coincide_indebido"] == 0
    assert concordancia["por_estado"]["parcial"] == {"esperados": 1, "aciertos": 1}
    assert concordancia["por_estado"]["no_coincide"] == {"esperados": 1, "aciertos": 1}


def test_poblacion_baja_la_concordancia_y_cuenta_el_indebido_que_corresponde_cuando_se_altera_un_esperado(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    estados = copy.deepcopy(ESTADOS)
    por_id = {e["id"]: e for e in estados}
    por_id["F-21b"]["esperado"] = {"estado": "desconocido"}  # las reglas dicen no_coincide
    por_id["F-22"]["esperado"] = {"estado": "parcial"}  # las reglas dicen coincide

    _, reporte, _ = _correr(tmp_path, capsys, estados=estados)

    assert reporte is not None
    concordancia = reporte["metricas"]["concordancia"]
    assert concordancia["aciertos"] == len(ESTADOS) - 2
    assert (concordancia["no_coincide_indebido"], concordancia["coincide_indebido"]) == (1, 1)
    assert concordancia["marca"] == "fuera_de_meta"


@pytest.mark.ac("US-233b", 5)
def test_poblacion_no_baja_sin_evidencia_respecto_del_baseline_ni_invoca_al_llm_con_la_extraccion_activa(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """No baja sin evidencia respecto del baseline y no invoca al LLM cuando la extracción de US-242 está activa
    [US-233b AC-5]. Mide de verdad la suite `all` de test-fake contra data/evaluation/baseline.json."""
    codigo, reporte, _ = _correr(tmp_path, capsys, puertos=PuertosDePoblacion())

    assert codigo == 0 and reporte is not None
    sin_evidencia = reporte["metricas"]["sin_evidencia"]
    assert sin_evidencia["baja"] is False
    assert sin_evidencia["actual"] >= sin_evidencia["baseline"]
    assert (sin_evidencia["invocaciones_llm"], sin_evidencia["top_relevance_no_nulos"]) == (0, 0)


def test_poblacion_falla_y_nombra_sin_evidencia_cuando_la_metrica_baja_respecto_del_baseline(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    baja = PuertosDePoblacion(
        medidor_sin_evidencia=lambda _c: MedicionSinEvidencia(0.8, 0, 0)  # baseline: 1.0
    )

    codigo, reporte, error = _correr(tmp_path, capsys, puertos=baja)

    assert codigo != 0 and "sin_evidencia" in error
    assert reporte is not None and reporte["metricas"]["sin_evidencia"]["baja"] is True


def test_poblacion_falla_cuando_el_camino_sin_evidencia_invoca_al_llm(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    invoca = PuertosDePoblacion(medidor_sin_evidencia=lambda _c: MedicionSinEvidencia(1.0, 1, 0))

    codigo, _, error = _correr(tmp_path, capsys, puertos=invoca)

    assert codigo != 0 and "sin_evidencia" in error


@pytest.mark.ac("US-233b", 6)
def test_poblacion_marca_out06_cerrada_solo_con_tasa_de_cortes_cero_sobre_al_menos_20_pares(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Marca OUT-06 cerrada solo con tasa de cortes 0 sobre ≥ 20 pares [US-233b AC-6]."""
    _, cerrada, _ = _correr(tmp_path / "a", capsys, bucle=pares_del_bucle(20))
    _, corta, _ = _correr(tmp_path / "b", capsys, bucle=pares_del_bucle(19))
    codigo, abierta, _ = _correr(tmp_path / "c", capsys, bucle=pares_del_bucle(20, cortes=1))

    assert cerrada is not None and corta is not None and abierta is not None
    assert cerrada["metricas"]["bucle"] == {
        "pares": 20,
        "cortes": 0,
        "tasa": 0.0,
        "minimo_de_pares": 20,
        "out06": "cerrada",
    }
    assert corta["metricas"]["bucle"]["out06"] == "insuficiente"
    assert (abierta["metricas"]["bucle"]["tasa"], abierta["metricas"]["bucle"]["out06"]) == (
        0.05,
        "abierta",
    )
    assert codigo == 0  # la tasa del bucle alimenta OUT-06; no es la invariante AC-3 del dorado


@pytest.mark.ac("US-233b", 7)
@pytest.mark.parametrize(
    "revisor",
    [
        None,
        {"rol": "oncologo_revisor"},
        {"fecha": "2026-10-31"},
        {"rol": "", "fecha": "2026-10-31"},
    ],
)
def test_poblacion_marca_no_concluyente_y_nunca_pass_cuando_el_dorado_no_trae_revisor_o_fecha(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], revisor: dict[str, str] | None
) -> None:
    """Marca no concluyente y nunca PASS cuando el dorado no trae revisor o fecha [US-233b AC-7]."""
    codigo, reporte, _ = _correr(tmp_path, capsys, revisor=revisor)

    assert codigo == 0 and reporte is not None
    for criterio in reporte["metricas"]["por_criterio"]:
        assert criterio["marca_precision"] == criterio["marca_cobertura"] == "no_concluyente"
    assert reporte["veredicto"]["resultado"] == "no_concluyente"
    assert reporte["veredicto"]["resultado"] != "pass"


def test_poblacion_da_pass_cuando_el_dorado_esta_revisado_y_todo_cumple_las_metas(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo, reporte, _ = _correr(tmp_path, capsys)

    assert codigo == 0 and reporte is not None
    assert reporte["veredicto"]["resultado"] == "pass"


def test_poblacion_marca_no_concluyente_cuando_el_dorado_tiene_menos_pares_que_el_minimo(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _, reporte, _ = _correr(tmp_path, capsys, config={"dorado": {"minimo_de_pares": 30}})

    assert reporte is not None
    assert reporte["veredicto"]["resultado"] == "no_concluyente"
    assert "muestra_insuficiente" in reporte["veredicto"]["causas"]


@pytest.mark.ac("US-233b", 8)
@pytest.mark.parametrize(
    "dorado",
    [{"licencia": None}, {"licencia": "propietaria"}, {"clase": "real_anonimizado"}],
)
def test_poblacion_se_niega_con_codigo_1_y_sin_calcular_metricas_cuando_el_manifiesto_no_declara_licencia_aceptada(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], dorado: dict[str, Any]
) -> None:
    """Contiene solo corpus público con licencia y agregados [US-233b AC-8]: sin licencia aceptada, código 1."""
    codigo, reporte, error = _correr(tmp_path, capsys, **dorado)

    assert codigo == 1
    assert reporte is None
    assert "la suite no corre" in error


def test_poblacion_se_niega_con_codigo_2_cuando_el_proveedor_es_local_sin_cablear(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo, reporte, _ = _correr(tmp_path, capsys, config={"adaptadores": {"proveedor": "local"}})

    assert codigo == 2 and reporte is None
