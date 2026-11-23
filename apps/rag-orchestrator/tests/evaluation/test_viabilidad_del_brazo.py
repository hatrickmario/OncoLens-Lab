"""``viabilidad_del_brazo`` (US-278 AC-5, ADR-39): regla pura, con los topes recibidos y ninguno escrito en la regla."""

from __future__ import annotations

import pytest

from app.evaluation.viabilidad_del_brazo import viabilidad_del_brazo

TOPE_P95_S = 20.0
LIMITE_GB = 30.0


def _viabilidad(p95: float | None, memoria: float | None):
    return viabilidad_del_brazo(p95, TOPE_P95_S, memoria, LIMITE_GB)


def test_un_brazo_dentro_de_los_dos_topes_es_viable() -> None:
    resultado = _viabilidad(12.5, 24.0)

    assert (resultado.estado, resultado.motivos) == ("viable", ())
    assert (resultado.p95_consulta_s, resultado.memoria_gb) == (12.5, 24.0)


def test_un_brazo_justo_en_el_tope_es_viable_porque_el_exceso_es_estricto() -> None:
    assert _viabilidad(TOPE_P95_S, LIMITE_GB).estado == "viable"


def test_un_p95_sobre_el_tope_es_no_viable_por_latencia_con_el_valor_medido() -> None:
    resultado = _viabilidad(20.5, 24.0)

    assert (resultado.estado, resultado.motivos, resultado.p95_consulta_s) == (
        "no_viable",
        ("latencia",),
        20.5,
    )


def test_una_memoria_sobre_el_limite_es_no_viable_por_memoria() -> None:
    resultado = _viabilidad(12.5, 30.5)

    assert (resultado.estado, resultado.motivos, resultado.memoria_gb) == (
        "no_viable",
        ("memoria",),
        30.5,
    )


def test_los_dos_excesos_dan_los_dos_motivos_en_el_mismo_orden() -> None:
    assert _viabilidad(21.0, 31.0).motivos == ("latencia", "memoria")


@pytest.mark.parametrize(("p95", "memoria"), [(None, 24.0), (12.5, None), (None, None)])
def test_una_medicion_ausente_es_no_medido_y_nunca_viable(
    p95: float | None, memoria: float | None
) -> None:
    resultado = _viabilidad(p95, memoria)

    assert (resultado.estado, resultado.motivos) == ("no_medido", ())


def test_un_exceso_medido_manda_sobre_la_otra_medicion_ausente() -> None:
    assert _viabilidad(25.0, None).estado == "no_viable"
    assert _viabilidad(None, 31.0).estado == "no_viable"


def test_un_cero_medido_cuenta_como_medido_y_no_como_ausente() -> None:
    assert _viabilidad(0.0, 0.0).estado == "viable"
