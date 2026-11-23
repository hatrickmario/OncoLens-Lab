"""Métricas del dorado ampliado de la familia `poblacion` (L1D-299, S7-D3): precisión y cobertura por tipo de redacción,
valores que la extracción da como elegibilidad en un distractor y recuento de la rendija de C-3 (Q-1).

El extractor es el de producción con el LLM y el NLI falsos que dicta el dorado; las reglas de estado son las reales.
Solo agregados e identificadores en el reporte (RN-14).
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from app.evaluation.corrida_poblacion import MedicionSinEvidencia, PuertosDePoblacion
from app.evaluation.evaluate import main
from tests.evaluation.dorado_de_prueba import ESTADOS, PARES, escribir_config, escribir_dorado
from tests.support.fakes import RelojFijo

CASO_C3: dict[str, Any] = {
    "id": "C-3a",
    "criterio": "estado_menopausico",
    "tipo_de_cancer": "mama",
    "paciente": "premenopáusica",
    "valores": [{"valor": "postmenopausal women", "scope": "elegibilidad", "chunk": "ch-a"}],
    "esperado": {"estado": "desconocido"},
    "rendija": "c3",
}


def _correr(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], **dorado: Any
) -> tuple[int, dict[str, Any] | None, str]:
    carpeta = escribir_dorado(tmp_path / "dorado", **dorado)
    ruta = escribir_config(tmp_path, carpeta)
    salida = tmp_path / "salida"
    codigo = main(
        ["--config", str(ruta), "--suite", "poblacion", "--salida", str(salida)],
        reloj=RelojFijo(),
        puertos_poblacion=PuertosDePoblacion(lambda _c: MedicionSinEvidencia(1.0, 0)),
    )
    escritos = list(salida.glob("*.json")) if salida.exists() else []
    reporte = json.loads(escritos[0].read_text(encoding="utf-8")) if escritos else None
    return codigo, reporte, capsys.readouterr().err


@pytest.mark.ac("US-233b", 2)
def test_poblacion_reporta_precision_y_cobertura_por_tipo_de_redaccion_cuando_los_pares_traen_redaccion_dificil(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Reporta precisión y cobertura por tipo de redacción cuando los pares traen redaccion plantilla y dificil
    [US-233b AC-2]."""
    pares = copy.deepcopy(PARES)
    pares[0] |= {"redaccion": "dificil", "tipo": "rango"}
    pares[0]["propuesta"] = pares[0]["esperados"][:1]  # el LLM omite uno de los dos valores

    codigo, reporte, _ = _correr(tmp_path, capsys, pares=pares)

    assert codigo == 0 and reporte is not None
    por_redaccion = {r["redaccion"]: r for r in reporte["metricas"].get("por_redaccion", [])}
    assert set(por_redaccion) == {"dificil", "plantilla"}
    assert (por_redaccion["dificil"]["precision"], por_redaccion["dificil"]["cobertura"]) == (
        1.0,
        0.5,
    )
    assert (por_redaccion["plantilla"]["precision"], por_redaccion["plantilla"]["cobertura"]) == (
        1.0,
        1.0,
    )
    assert (por_redaccion["dificil"]["esperados"], por_redaccion["plantilla"]["esperados"]) == (
        2,
        3,
    )
    por_tipo = {t["tipo"]: t for t in reporte["metricas"].get("por_tipo_de_redaccion", [])}
    assert set(por_tipo) == {"rango"} and por_tipo["rango"]["cobertura"] == 0.5


@pytest.mark.ac("US-233b", 2)
def test_poblacion_cuenta_aparte_los_valores_dados_como_elegibilidad_en_un_distractor(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Cuenta aparte los valores que la extracción dio como elegibilidad en un distractor [US-233b AC-2]."""
    pares = copy.deepcopy(PARES)
    pares[2]["distractor"] = True  # t1-receptores: el esperado es solo de subgrupo
    pares[2]["propuesta"] = [
        {"valor": "triple-negative", "scope": "elegibilidad", "chunk": "ch-t1-2"}
    ]

    codigo, reporte, _ = _correr(tmp_path, capsys, pares=pares)

    assert codigo == 0 and reporte is not None
    assert reporte["metricas"].get("distractores") == {
        "pares": 1,
        "valores_indebidos": 1,
        "pares_con_indebidos": 1,
    }


def test_poblacion_no_cuenta_valores_indebidos_cuando_el_distractor_conserva_su_alcance_de_subgrupo(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    pares = copy.deepcopy(PARES)
    pares[2]["distractor"] = True

    _, reporte, _ = _correr(tmp_path, capsys, pares=pares)

    assert reporte is not None
    assert reporte["metricas"].get("distractores") == {
        "pares": 1,
        "valores_indebidos": 0,
        "pares_con_indebidos": 0,
    }


@pytest.mark.ac("US-233b", 4)
def test_poblacion_cuenta_aparte_los_casos_de_la_rendija_c3_con_el_estado_que_dan_las_reglas_vigentes(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Cuenta aparte los casos de la rendija de C-3 (elegibilidad de un solo valor sin «solo») sin cambiar la regla
    [US-233b AC-4]."""
    estados = [*copy.deepcopy(ESTADOS), copy.deepcopy(CASO_C3)]

    codigo, reporte, _ = _correr(tmp_path, capsys, estados=estados)

    assert codigo == 0 and reporte is not None
    assert reporte["metricas"].get("rendija_c3") == {
        "casos": 1,
        "desconocido": 1,
        "otros": 0,
    }
    concordancia = reporte["metricas"]["concordancia"]
    assert (concordancia["aciertos"], concordancia["total"]) == (len(estados), len(estados))


@pytest.mark.parametrize(
    ("cambio", "palabra"),
    [
        (lambda pares: pares[0].update(redaccion="rebuscada"), "redaccion"),
        (lambda pares: pares[0].update(redaccion="dificil", tipo="adivinanza"), "tipo"),
        (
            lambda pares: pares[0].update(distractor=True),
            "distractor",
        ),  # su esperado es de elegibilidad
    ],
)
def test_poblacion_se_niega_con_codigo_1_cuando_la_redaccion_el_tipo_o_el_distractor_no_son_validos(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], cambio: Any, palabra: str
) -> None:
    pares = copy.deepcopy(PARES)
    cambio(pares)

    codigo, reporte, error = _correr(tmp_path, capsys, pares=pares)

    assert codigo == 1 and reporte is None
    assert "la suite no corre" in error and palabra in error
