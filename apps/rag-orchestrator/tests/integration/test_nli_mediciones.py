"""Latencia de la etapa NLI y memoria conjunta de los tres modelos (US-231b AC-6 y AC-7, NFR-01, ADR-39).

Mediciones LOCALES (marcador ``models``, VM de Docker de >= 10 GB), no compuertas de la CI: el informe se escribe SIEMPRE
antes de afirmar, para que un exceso quede a la vista del refinamiento (no se oculta ni se ajusta el presupuesto).
``MODEL_LATENCY_REPORT`` y ``MODEL_MEMORY_REPORT`` fijan la ruta de cada JSON (por defecto, el directorio temporal).
Los tests sin ``models`` ejercitan el cálculo de los informes con un reloj inyectado y cifras controladas.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pytest

from app.application.ports import ParNli
from tests.support.inferencia_falsa import PARES_NLI_FX06AC
from tests.support.latencia import Etapa, informe_de_latencia, medir_etapa
from tests.support.memoria import (
    a_mib,
    informe_de_memoria,
    pico_de_rss_mib,
    rss_actual_mib,
)
from tests.support.modelos import (
    cargar_modelos_reales,
    ejercitar_el_nli,
    ejercitar_los_cuatro_adapters,
)

PRESUPUESTO_NLI_MS = 1500.0  # STAGE_P95_BUDGET_MS["nli"] (ADR-39)
PRESUPUESTO_MEMORIA_MIB = 4489.0  # 964 + 2642 + 883 MiB medidos por separado (ADR-39)


def _pares() -> list[ParNli]:
    return [ParNli(premisa=p, hipotesis=h) for p, h, _ in PARES_NLI_FX06AC]


class RelojControlado:
    """Reloj monótono en segundos: cada lectura avanza ``paso`` (el test controla cuánto tarda cada corrida)."""

    def __init__(self, paso: float) -> None:
        self._ahora = 0.0
        self._paso = paso
        self._lecturas = 0

    def __call__(self) -> float:
        self._lecturas += 1
        if self._lecturas % 2 == 0:  # lectura de fin de una corrida
            self._ahora += self._paso
        return self._ahora


@pytest.mark.models
@pytest.mark.ac("US-231b", 6)
def test_la_mediana_de_la_etapa_nli_de_fx06ac_en_un_lote_queda_dentro_de_1500_ms_y_el_informe_la_reporta(
    tmp_path: Path,
) -> None:
    clasificador = cargar_modelos_reales().clasificador_nli
    pares = _pares()

    informe = informe_de_latencia(
        [
            Etapa(
                "nli",
                medir_etapa(lambda: clasificador.clasificar(pares), time.perf_counter),
                PRESUPUESTO_NLI_MS,
            )
        ]
    )
    destino = Path(os.environ.get("MODEL_LATENCY_REPORT", tmp_path / "latencia-nli.json"))
    destino.write_text(json.dumps(informe, indent=2), encoding="utf-8")
    print(json.dumps(informe, indent=2))

    assert informe["nli"]["dentro_de_presupuesto"], (
        f"etapa NLI fuera de presupuesto (ver {destino.name}): {informe['nli']['mediana_ms']} ms"
    )


@pytest.mark.models
@pytest.mark.ac("US-231b", 7)
def test_el_rss_maximo_con_los_tres_modelos_cargados_e_inferidos_una_vez_no_excede_4489_mib_y_el_informe_lo_reporta(
    tmp_path: Path,
) -> None:
    modelos = cargar_modelos_reales()
    pico_de_la_carga = (
        pico_de_rss_mib()
    )  # los bytes hasheados conviven con la sesión hasta crearla (D12)
    ejercitar_los_cuatro_adapters(modelos)
    ejercitar_el_nli(modelos)

    informe = informe_de_memoria(
        pico_durante_la_carga_mib=pico_de_la_carga,
        pico_total_mib=pico_de_rss_mib(),
        presupuesto_mib=PRESUPUESTO_MEMORIA_MIB,
        rss_en_regimen_mib=rss_actual_mib(),
    )
    destino = Path(os.environ.get("MODEL_MEMORY_REPORT", tmp_path / "memoria.json"))
    destino.write_text(json.dumps(informe, indent=2), encoding="utf-8")
    print(json.dumps(informe, indent=2))

    assert informe["dentro_de_presupuesto"], (
        f"RSS fuera de presupuesto (ver {destino.name}): {informe['pico_total_mib']} MiB"
    )


def test_el_informe_de_latencia_nli_reporta_el_exceso_y_no_lo_oculta_con_un_reloj_inyectado() -> (
    None
):
    corridas = medir_etapa(lambda: None, RelojControlado(paso=2.0), calentamiento=0)

    informe = informe_de_latencia([Etapa("nli", corridas, PRESUPUESTO_NLI_MS)])

    assert informe["nli"]["mediana_ms"] == pytest.approx(2000.0)
    assert informe["nli"]["dentro_de_presupuesto"] is False
    assert informe["nli"]["exceso_ms"] == pytest.approx(500.0)


def test_el_informe_de_latencia_nli_acepta_una_mediana_dentro_del_presupuesto() -> None:
    corridas = medir_etapa(lambda: None, RelojControlado(paso=0.25), calentamiento=0)

    informe = informe_de_latencia([Etapa("nli", corridas, PRESUPUESTO_NLI_MS)])

    assert informe["nli"]["dentro_de_presupuesto"] is True and "exceso_ms" not in informe["nli"]


@pytest.mark.parametrize(
    ("valor", "plataforma", "mib"),
    [(2 * 1024 * 1024, "darwin", 2.0), (2048, "linux", 2.0), (4489 * 1024, "linux", 4489.0)],
)
def test_ru_maxrss_se_normaliza_a_mib_segun_la_plataforma(
    valor: int, plataforma: str, mib: float
) -> None:
    assert a_mib(valor, plataforma) == pytest.approx(mib)


def test_el_informe_de_memoria_reporta_el_exceso_con_su_cifra_y_ambos_picos() -> None:
    informe = informe_de_memoria(
        pico_durante_la_carga_mib=5200.0,
        pico_total_mib=5200.0,
        presupuesto_mib=PRESUPUESTO_MEMORIA_MIB,
        rss_en_regimen_mib=4300.0,
    )

    assert informe["dentro_de_presupuesto"] is False and informe["exceso_mib"] == 711.0
    assert (
        informe["pico_durante_la_carga_mib"] == 5200.0 and informe["rss_en_regimen_mib"] == 4300.0
    )


def test_sin_proc_el_rss_en_regimen_es_none_y_no_una_cifra_inventada(tmp_path: Path) -> None:
    assert rss_actual_mib(tmp_path / "no-existe") is None
