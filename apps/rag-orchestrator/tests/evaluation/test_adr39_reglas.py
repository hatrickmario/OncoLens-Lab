"""Reglas puras de la fase B de ADR-39 (US-224): descarte, empate, elección y validación de JSON."""

from __future__ import annotations

import dataclasses

import pytest

from app.application.generation import ESQUEMA_DE_GENERACION
from app.scripts.adr39.config import cargar_config
from app.scripts.adr39.reglas import (
    Candidato,
    Restricciones,
    decidir_candidato,
    descartar_por_restriccion,
    desempatar_por_memoria,
    elegir_candidato,
    mediana,
    percentil_95,
    porcentaje_json_valido,
    validar_contra_esquema,
)

MUESTRA = 20


@pytest.fixture(scope="module")
def r() -> Restricciones:
    return cargar_config().restricciones


def completo(id_c: str = "A", **cambios: object) -> Candidato:
    """Candidato con todas las cifras medidas y dentro de las restricciones."""
    base = Candidato(
        id=id_c,
        licencia="Apache-2.0",
        memoria_llm_gb=15.0,
        memoria_stack_gb=24.0,
        swap_creciente=False,
        json_valido=1.0,
        e2e_p95_ms=9000.0,
        extraccion_p95_ms=30000.0,
        fidelidad=0.95,
        salidas_prescriptivas=0,
        salidas_otro_idioma=0,
    )
    return dataclasses.replace(base, **cambios)


def test_percentil_95_y_mediana_calculan_sobre_la_serie_de_tiempos() -> None:
    serie = [float(n) for n in range(1, 101)]

    assert mediana(serie) == 50.5
    assert percentil_95(serie) == pytest.approx(95.05)


@pytest.mark.parametrize(
    ("cambio", "eliminatoria"),
    [
        ({"licencia": "GPL-3.0"}, "licencia"),
        ({"memoria_llm_gb": 21.01}, "memoria_llm"),
        ({"memoria_stack_gb": 30.5}, "memoria_stack"),
        ({"swap_creciente": True}, "swap"),
        ({"json_valido": 0.985}, "json_valido"),
        ({"e2e_p95_ms": 15001.0}, "p95_e2e"),
        ({"extraccion_p95_ms": 60001.0}, "p95_extraccion"),
        ({"fidelidad": 0.89}, "fidelidad"),
        ({"salidas_prescriptivas": 1}, "prescriptivo"),
        ({"salidas_otro_idioma": 1}, "otro_idioma"),
    ],
)
def test_descartar_por_restriccion_nombra_la_eliminatoria_y_la_cifra_cuando_se_incumple(
    r: Restricciones, cambio: dict[str, object], eliminatoria: str
) -> None:
    descarte = descartar_por_restriccion(completo(**cambio), r)

    assert descarte is not None
    assert (descarte.eliminatoria, descarte.candidato) == (eliminatoria, "A")
    assert descarte.cifra


def test_descartar_por_restriccion_acepta_los_valores_en_el_limite(r: Restricciones) -> None:
    limite = completo(
        memoria_llm_gb=21.0, memoria_stack_gb=30.0, json_valido=0.99, e2e_p95_ms=15000.0,
        extraccion_p95_ms=60000.0, fidelidad=0.90,
    )  # fmt: skip

    assert descartar_por_restriccion(limite, r) is None


def test_descartar_por_restriccion_aplica_la_primera_eliminatoria_en_el_orden_de_d3(
    r: Restricciones,
) -> None:
    varias = completo(memoria_llm_gb=24.0, e2e_p95_ms=99999.0, json_valido=0.5)

    assert descartar_por_restriccion(varias, r).eliminatoria == "memoria_llm"  # type: ignore[union-attr]


def test_decidir_candidato_queda_pendiente_cuando_faltan_cifras_y_no_se_asume_cero(
    r: Restricciones,
) -> None:
    sin_medir = Candidato(
        id="H", licencia="Apache-2.0", licencia_verificada=False, memoria_llm_gb=17.0
    )

    veredicto = decidir_candidato(sin_medir, r)

    assert veredicto.estado == "pendiente"
    assert "licencia_verificada" in veredicto.pendientes
    assert "e2e_p95_ms" in veredicto.pendientes


def test_decidir_candidato_descarta_aunque_falten_otras_cifras(r: Restricciones) -> None:
    solo_memoria = Candidato(id="D", licencia="Apache-2.0", memoria_llm_gb=24.0)

    assert decidir_candidato(solo_memoria, r).estado == "descartado"


def test_desempatar_por_memoria_elige_el_de_menor_memoria_residente() -> None:
    grande = completo("G", memoria_llm_gb=18.0)
    chico = completo("B", memoria_llm_gb=7.7)

    assert desempatar_por_memoria([grande, chico]).id == "B"


@pytest.mark.ac("US-224", 5)
def test_elegir_candidato_prefiere_la_mayor_fidelidad_y_desempata_por_memoria_dentro_de_una_salida(
    r: Restricciones,
) -> None:
    a = completo("A", fidelidad=0.95, memoria_llm_gb=15.0)
    b = completo(
        "B", fidelidad=0.90, memoria_llm_gb=7.7
    )  # 2 salidas por debajo de H: fuera del empate
    h = completo("H", fidelidad=1.0, memoria_llm_gb=17.0)

    decision = elegir_candidato([a, b, h], r, MUESTRA)

    assert decision.elegido is not None
    assert (
        decision.elegido.id == "A"
    )  # empatan H (1,0) y A (0,95); B queda 2 salidas abajo; gana la menor memoria
    assert decision.desempatado_por_memoria is True


def test_elegir_candidato_un_modelo_mas_grande_no_gana_por_serlo(r: Restricciones) -> None:
    grande = completo("H", fidelidad=0.95, memoria_llm_gb=17.0)
    pequeno = completo("C", fidelidad=0.95, memoria_llm_gb=8.9)

    assert elegir_candidato([grande, pequeno], r, MUESTRA).elegido.id == "C"  # type: ignore[union-attr]


def test_elegir_candidato_exige_aceptacion_escrita_para_la_licencia_condicionada(
    r: Restricciones,
) -> None:
    medgemma = completo("E", licencia="HAI-DEF", fidelidad=1.0, memoria_llm_gb=5.0)
    apache = completo("A", fidelidad=0.92, memoria_llm_gb=15.0)

    sin_aceptar = elegir_candidato([medgemma, apache], r, MUESTRA)
    aceptada = elegir_candidato([medgemma, apache], r, MUESTRA, frozenset({"HAI-DEF"}))

    assert sin_aceptar.elegido.id == "A"  # type: ignore[union-attr]
    assert aceptada.elegido.id == "E"  # type: ignore[union-attr]


def test_elegir_candidato_escala_al_usuario_cuando_nadie_supera_las_eliminatorias(
    r: Restricciones,
) -> None:
    lento = completo("A", e2e_p95_ms=20000.0)
    pesado = completo("H", memoria_llm_gb=22.0)

    decision = elegir_candidato([lento, pesado], r, MUESTRA)

    assert decision.elegido is None
    assert decision.escalar_al_usuario is True
    assert {d.eliminatoria for d in decision.descartados} == {"p95_e2e", "memoria_llm"}


def test_elegir_candidato_no_escala_mientras_haya_candidatos_pendientes(r: Restricciones) -> None:
    pendiente = Candidato(id="A", licencia="Apache-2.0", memoria_llm_gb=15.0)

    decision = elegir_candidato([pendiente], r, MUESTRA)

    assert decision.elegido is None
    assert decision.escalar_al_usuario is False


def test_elegir_candidato_declara_riesgo_y_respaldo_cuando_el_margen_es_menor_de_1_gb(
    r: Restricciones,
) -> None:
    justo = completo("G", memoria_llm_gb=20.5, fidelidad=1.0)
    holgado = completo("A", memoria_llm_gb=15.0, fidelidad=0.80)  # bajo 0,90: descartado
    respaldo = completo("B", memoria_llm_gb=7.7, fidelidad=0.90)

    decision = elegir_candidato([justo, holgado, respaldo], r, MUESTRA)

    assert decision.elegido.id == "G"  # type: ignore[union-attr]
    assert decision.riesgo_de_margen == ("memoria_llm",)
    assert decision.respaldo is not None
    assert decision.respaldo.id == "B"


@pytest.mark.ac("US-224", 5)
def test_validar_contra_esquema_acepta_la_salida_del_s1_y_rechaza_json_invalido_o_fuera_de_esquema() -> (
    None
):
    valida = '{"options": [{"option": "o", "rationale": "r", "citedChunkIds": ["c1"]}]}'

    assert validar_contra_esquema(valida, ESQUEMA_DE_GENERACION) is True
    assert validar_contra_esquema('{"options": "no"}', ESQUEMA_DE_GENERACION) is False
    assert validar_contra_esquema("{ no es json", ESQUEMA_DE_GENERACION) is False
    assert validar_contra_esquema('{"options": [{"option": "o"}]}', ESQUEMA_DE_GENERACION) is False


def test_porcentaje_json_valido_cuenta_la_llamada_sin_salida_como_invalida() -> None:
    salidas: list[str | None] = ['{"options": []}', None, "basura", '{"options": []}']

    assert porcentaje_json_valido(salidas, ESQUEMA_DE_GENERACION) == 0.5


def test_porcentaje_json_valido_rechaza_una_lista_vacia() -> None:
    with pytest.raises(ValueError):
        porcentaje_json_valido([], ESQUEMA_DE_GENERACION)
