"""Juez local acotado y acuerdo medido contra el NLI (US-233a AC-5 y AC-6, ADR-41, RN-12).

LLM del juez fingido en su puerto con ``respx``: ningún request sale de loopback.
"""

from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from app.evaluation.dataset_loader import CLASE_SINTETICA
from app.evaluation.juez_fidelidad import JuezLlmLocal
from app.evaluation.llamadas import RegistroDeLlamadas
from tests.evaluation.test_fidelidad_juez import (
    COMPLETIONS,
    LOCAL,
    config_con_juez,
    correr,
    veredicto,
)

SOPORTADA = '{"veredicto": "soportada", "cita": "F1"}'
ID_DE_AFIRMACION = re.compile(r"[A-Za-z0-9-]+/a\d+")
JUEZ_LOCAL = {
    "proveedor": "local",
    "base_url": LOCAL,
    "modelo": "juez-fingido@1",
    "temperatura": 0,
    "semilla": 7,
}


def contenido_de_usuario(llamada: Any) -> str:
    cuerpo = json.loads(llamada.request.content)
    return "\n".join(m["content"] for m in cuerpo["messages"] if m["role"] == "user")


def reporte_del_juez(
    tmp_path: Path, respuestas: list[httpx.Response], acuerdo_minimo: float
) -> dict[str, Any]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    config = config_con_juez(tmp_path, **JUEZ_LOCAL, acuerdo_minimo=acuerdo_minimo)
    with respx.mock(assert_all_called=False) as http:
        http.post(COMPLETIONS).mock(side_effect=respuestas)
        codigo, reporte = correr(config, tmp_path / "salida")
    assert codigo == 0 and reporte is not None
    return reporte["metricas"]["completa"]["fidelidad"]["juez_llm"]


@pytest.mark.ac("US-233a", 5)
def test_el_juez_recibe_solo_la_afirmacion_y_sus_fragmentos_con_la_temperatura_y_la_semilla_de_configuracion() -> (
    None
):
    with respx.mock() as http:
        ruta = http.post(COMPLETIONS).mock(return_value=veredicto(SOPORTADA))
        juez = JuezLlmLocal(
            httpx.AsyncClient(base_url=LOCAL),
            modelo="juez-fingido@1",
            temperatura=0.0,
            semilla=7,
            registro=RegistroDeLlamadas(),
            clase_datos=CLASE_SINTETICA,
        )

        asyncio.run(juez.juzgar_soporte("AFIRMACION-UNICA", ["FRAGMENTO-UNO", "FRAGMENTO-DOS"]))
        cuerpo = json.loads(ruta.calls[0].request.content)

    usuario = contenido_de_usuario(ruta.calls[0])
    sistema = next(m["content"] for m in cuerpo["messages"] if m["role"] == "system")
    assert usuario.count("AFIRMACION-UNICA") == 1
    assert usuario.count("FRAGMENTO-UNO") == 1 and usuario.count("FRAGMENTO-DOS") == 1
    assert "juez-fingido" not in usuario and "juez-fingido" not in sistema
    assert (cuerpo["temperature"], cuerpo["seed"]) == (0.0, 7)
    assert '"veredicto"' in sistema and '"cita"' in sistema
    assert sistema.lower().count("ejemplo") == 3


@pytest.mark.ac("US-233a", 5)
def test_un_json_invalido_o_una_cita_inexistente_cuentan_como_no_soportados_y_se_contabilizan(
    tmp_path: Path,
) -> None:
    juez = reporte_del_juez(
        tmp_path,
        [
            veredicto("esto no es JSON"),
            veredicto('{"veredicto": "soportada", "cita": "F99"}'),
            veredicto(SOPORTADA),
            veredicto(SOPORTADA),
        ],
        acuerdo_minimo=0.5,
    )

    assert (juez["afirmaciones"], juez["soportadas"], juez["veredictos_invalidos"]) == (4, 2, 2)


@pytest.mark.ac("US-233a", 6)
def test_el_reporte_trae_el_acuerdo_con_el_nli_las_discrepancias_y_las_fidelidades_por_separado(
    tmp_path: Path,
) -> None:
    config = config_con_juez(tmp_path, **JUEZ_LOCAL, acuerdo_minimo=0.5)
    with respx.mock(assert_all_called=False) as http:
        http.post(COMPLETIONS).mock(return_value=veredicto(SOPORTADA))
        codigo, reporte = correr(config, tmp_path / "salida")

    assert codigo == 0 and reporte is not None
    fidelidad = reporte["metricas"]["completa"]["fidelidad"]
    acuerdo = fidelidad["juez_llm"]["acuerdo_con_nli"]
    assert (acuerdo["muestra"], acuerdo["porcentaje"], acuerdo["kappa"]) == (4, 0.75, 0.0)
    assert len(acuerdo["discrepancias"]) == 1
    assert ID_DE_AFIRMACION.fullmatch(acuerdo["discrepancias"][0])
    assert (fidelidad["nli"]["fidelidad"], fidelidad["juez_llm"]["fidelidad"]) == (0.75, 1.0)


@pytest.mark.ac("US-233a", 6)
def test_un_acuerdo_bajo_el_minimo_marca_la_fidelidad_del_juez_no_concluyente(
    tmp_path: Path,
) -> None:
    bajo = reporte_del_juez(tmp_path / "a", [veredicto(SOPORTADA)] * 4, acuerdo_minimo=0.9)
    suficiente = reporte_del_juez(tmp_path / "b", [veredicto(SOPORTADA)] * 4, acuerdo_minimo=0.75)

    assert (bajo["estado"], suficiente["estado"]) == ("no_concluyente", "concluyente")


@pytest.mark.ac("US-233a", 6)
def test_sin_muestra_humana_el_acuerdo_con_el_humano_queda_sin_medir_y_no_cero(
    tmp_path: Path,
) -> None:
    juez = reporte_del_juez(tmp_path, [veredicto(SOPORTADA)] * 4, acuerdo_minimo=0.5)

    assert juez["acuerdo_con_humano"] == "sin_medir"
