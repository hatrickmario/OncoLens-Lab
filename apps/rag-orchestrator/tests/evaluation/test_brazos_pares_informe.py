"""El informe de los brazos de pares y de reescritura (US-277 AC-2, AC-5, AC-6; l1d-335 tarea 4.1b).

Todo con adapters falsos: la corrida con modelos locales es de la corrida final del S7 (tarea 4.4). Las cifras de estos tests no
dicen nada del RAG real. Sin texto de preguntas ni de chunks en el informe (RN-14).
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from app.evaluation.adopcion_del_brazo import (
    MOTIVO_FALSOS_SIN_EVIDENCIA,
    MOTIVO_NO_VIABLE,
    MOTIVO_RETROCESO,
    decidir_adopcion,
)
from app.evaluation.armado_comparacion import armar_comparacion
from app.evaluation.brazos_recuperacion import Brazo
from app.evaluation.config_suite import ConfigSuite, cargar_config_suite
from app.evaluation.corrida_brazos import evaluar_brazos
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.evaluate import main
from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio
from app.evaluation.metricas.parafrasis import proporcion_de_parafrasis_recuperadas
from app.evaluation.parafrasis_de_la_comparacion import con_parafrasis
from app.schemas.generated.models import RetrievalMode
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

CONFIGS = RAIZ_APP / "eval" / "configs"
CONFIG = CONFIGS / "s7-sinonimos-brazos-fake.yaml"
ENTORNO = {"STACK_MEMORY_LIMIT_GB": "30"}
ENTORNO_LOCAL = {
    **ENTORNO,
    "RETRIEVAL_REGRESSION_TOLERANCE": "0.05",
    "RELEVANCE_THRESHOLD": "0.30",
    "NLI_ENTAILMENT_THRESHOLD": "0.7",
    "RETRIEVAL_TOP_K": "30",
    "RERANK_TOP_N": "10",
}
BRAZOS = ["A0", "A0-reescritura", "A0-30-pares", "A0-reescritura-30-pares"]
LARGO_DEL_RERANKER_FALSO = {"reranker_modo": "primera", "reranker_solape": 2}


# --- AC-2: la proporción de paráfrasis recuperadas ----------------------------------------------------------------------


PARES = {"P1": ("a1", "a2"), "P2": ("b1", "b2"), "P3": ("c1", "c2"), "P4": ("d1", "d2")}


@pytest.mark.ac("US-277", 2)
def test_declara_sin_pares_aplicables_y_proporcion_nula_cuando_no_hay_pares_atribuidos_a_la_recuperacion_o_al_umbral() -> (
    None
):
    todas_con_evidencia = {r: True for rs in PARES.values() for r in rs}
    todas_sin_evidencia = {r: False for rs in PARES.values() for r in rs}

    ya_recuperados = proporcion_de_parafrasis_recuperadas(
        PARES, todas_con_evidencia, todas_con_evidencia
    )
    ninguna_pierde = proporcion_de_parafrasis_recuperadas(
        PARES, todas_sin_evidencia, todas_con_evidencia
    )
    sin_pares = proporcion_de_parafrasis_recuperadas({}, {}, {})

    for resultado in (ya_recuperados, ninguna_pierde, sin_pares):
        assert resultado.sin_pares_aplicables is True
        assert resultado.proporcion is None  # null ≠ 0.0: no hay pares que medir
        assert (resultado.aplicables, resultado.recuperadas) == (0, 0)


def test_la_proporcion_cuenta_los_pares_que_la_referencia_pierde_y_el_brazo_recupera_con_todas_sus_redacciones() -> (
    None
):
    referencia = {
        "a1": True, "a2": False,  # pierde una redacción: aplicable
        "b1": True, "b2": False,  # aplicable
        "c1": True, "c2": True,  # no pierde: no aplicable
        "d1": False, "d2": False,  # ninguna tiene evidencia: no es una pérdida de la redacción
    }  # fmt: skip
    brazo = {
        "a1": True, "a2": True,  # recuperado
        "b1": True, "b2": False,  # sigue perdido
        "c1": True, "c2": True,
        "d1": True, "d2": True,
    }  # fmt: skip

    resultado = proporcion_de_parafrasis_recuperadas(PARES, referencia, brazo)

    assert (resultado.aplicables, resultado.recuperadas) == (2, 1)
    assert resultado.proporcion == 0.5 and resultado.sin_pares_aplicables is False


# --- AC-5: la adopción -----------------------------------------------------------------------------------------------


@pytest.mark.ac("US-277", 5)
def test_marca_el_brazo_no_adoptable_cuando_una_metrica_empeora_fuera_del_ruido() -> None:
    config, dataset, pares = _mundo()
    comparacion = replace(
        config.comparacion,  # type: ignore[type-var]
        tolerancia_retroceso=0.0,
        brazos=(
            Brazo("A0", RetrievalMode.dense, reranker_max_length=12, query_rewrite_enabled=False, **LARGO_DEL_RERANKER_FALSO),
            Brazo("A0-ciega", RetrievalMode.dense, reranker_max_length=1, query_rewrite_enabled=False, **LARGO_DEL_RERANKER_FALSO),
        ),
    )  # fmt: skip

    brazos = _correr(config, comparacion, dataset)
    seccion = armar_comparacion(config, comparacion, brazos, pares_de_parafrasis=pares).seccion

    ciega = {b["nombre"]: b for b in seccion["brazos"]}["A0-ciega"]
    assert ciega["retroceso"] is True
    assert ciega["adopcion"]["adoptable"] is False
    assert MOTIVO_RETROCESO in ciega["adopcion"]["motivos"]


def test_la_referencia_no_trae_adopcion_porque_no_se_compara_consigo_misma(
    corrida: tuple[Path, dict[str, dict[str, Any]]],
) -> None:
    _, informe = corrida

    assert "adopcion" not in informe["A0"]
    assert all("adopcion" in informe[nombre] for nombre in BRAZOS[1:])


@pytest.mark.parametrize(
    ("retroceso", "aumento", "viabilidad", "adoptable", "motivos"),
    [
        (True, 0.0, "viable", False, (MOTIVO_RETROCESO,)),
        (False, 0.06, "viable", False, (MOTIVO_FALSOS_SIN_EVIDENCIA,)),
        (False, 0.0, "no_viable", False, (MOTIVO_NO_VIABLE,)),
        (True, 0.5, "no_viable", False, (MOTIVO_RETROCESO, MOTIVO_FALSOS_SIN_EVIDENCIA, MOTIVO_NO_VIABLE)),
        (False, 0.05, "viable", True, ()),  # igual a la tolerancia no es empeorar
        (False, -0.2, "viable", True, ()),
        (False, 0.0, "no_medido", None, ()),  # sin memoria medida no se afirma que sea adoptable
        (False, None, "viable", None, ()),  # sin preguntas con respuesta no hay proporción que comparar
    ],
)  # fmt: skip
def test_decide_la_adopcion_solo_con_lo_medido(
    retroceso: bool,
    aumento: float | None,
    viabilidad: Any,
    adoptable: bool | None,
    motivos: tuple[str, ...],
) -> None:
    decision = decidir_adopcion(
        retroceso=retroceso,
        aumento_de_falsos_sin_evidencia=aumento,
        tolerancia=0.05,
        viabilidad=viabilidad,
    )

    assert (decision.adoptable, decision.motivos) == (adoptable, motivos)


# --- AC-6: los dos brazos de pares sobre las mismas preguntas -----------------------------------------------------------


@pytest.mark.ac("US-277", 6)
def test_reporta_los_dos_brazos_de_pares_sobre_las_mismas_preguntas(
    corrida: tuple[Path, dict[str, dict[str, Any]]],
) -> None:
    _, informe = corrida

    assert list(informe) == BRAZOS
    assert [informe[n]["reranker"]["max_pairs"] for n in BRAZOS] == [20, 20, 30, 30]
    for nombre in BRAZOS:
        brazo = informe[nombre]
        assert brazo["parafrasis"]["pares"] == informe["A0"]["parafrasis"]["pares"], nombre
        assert (
            brazo["falsos_sin_evidencia"]["total"] == informe["A0"]["falsos_sin_evidencia"]["total"]
        )
        assert [d["n"] for d in brazo["por_documento"]] == [
            d["n"] for d in informe["A0"]["por_documento"]
        ], nombre
        assert brazo["trazabilidad"]["consultas"] == informe["A0"]["trazabilidad"]["consultas"]
        # los pares aplicables son los de la referencia: todos los brazos se miden sobre los mismos pares
        assert (
            brazo["parafrasis_atribuidas"]["aplicables"]
            == informe["A0"]["parafrasis_atribuidas"]["aplicables"]
        )


@pytest.mark.ac("US-277", 6)
def test_cada_brazo_informa_su_reescritura_efectiva_y_su_proporcion_de_parafrasis(
    corrida: tuple[Path, dict[str, dict[str, Any]]],
) -> None:
    _, informe = corrida

    assert [informe[n]["reescritura"]["habilitada"] for n in BRAZOS] == [False, True, False, True]
    assert informe["A0"]["reescritura"]["invocaciones"] == 0
    assert informe["A0-reescritura"]["reescritura"]["invocaciones"] > 0
    for nombre in BRAZOS:
        atribuidas = informe[nombre]["parafrasis_atribuidas"]
        assert set(atribuidas) == {
            "aplicables",
            "recuperadas",
            "proporcion",
            "sin_pares_aplicables",
        }
        assert (atribuidas["proporcion"] is None) == atribuidas["sin_pares_aplicables"]
    assert (
        informe["A0"]["parafrasis_atribuidas"]["recuperadas"] == 0
    )  # la referencia no recupera lo que pierde


def test_el_informe_de_los_brazos_no_lleva_texto_de_preguntas_ni_de_chunks(
    corrida: tuple[Path, dict[str, dict[str, Any]]],
) -> None:
    _, dataset, _ = _mundo()

    contenido = next(corrida[0].glob("*.json")).read_text(encoding="utf-8")
    assert all(c.texto not in contenido for c in dataset.chunks[:30])
    assert all(p.texto not in contenido for p in dataset.preguntas[:30])


# --- la configuración -------------------------------------------------------------------------------------------------


def test_la_configuracion_fake_declara_los_cuatro_brazos_de_pares_y_reescritura() -> None:
    config = cargar_config_suite(CONFIG, ENTORNO)

    brazos = config.comparacion.brazos  # type: ignore[union-attr]

    assert [b.nombre for b in brazos] == BRAZOS
    assert [(b.reranker_max_pairs, b.query_rewrite_enabled) for b in brazos] == [
        (20, False),
        (20, True),
        (30, False),
        (30, True),
    ]
    assert config.comparacion.viabilidad is not None  # type: ignore[union-attr]


def test_la_configuracion_local_deja_los_pares_vigentes_a_settings_y_declara_solo_el_brazo_de_30() -> (
    None
):
    config = cargar_config_suite(CONFIGS / "s7-sinonimos-brazos.yaml", ENTORNO_LOCAL)

    brazos = config.comparacion.brazos  # type: ignore[union-attr]

    assert config.proveedor == "local" and config.indice_fuente == "milvus"
    assert [b.nombre for b in brazos] == BRAZOS
    assert [(b.reranker_max_pairs, b.query_rewrite_enabled) for b in brazos] == [
        (None, False),
        (None, True),
        (30, False),
        (30, True),
    ]
    assert (
        config.umbrales_de_settings is True
    )  # los umbrales actuales salen de Settings ([S7 resp. 11])


# --- apoyo ------------------------------------------------------------------------------------------------------------


def _mundo() -> tuple[ConfigSuite, Any, dict[str, tuple[str, ...]]]:
    config = cargar_config_suite(CONFIG, ENTORNO)
    base = FuenteDatasetEnDirectorio(config.dataset).cargar()
    dataset, pares = con_parafrasis(base, config.comparacion.parafrasis)  # type: ignore[arg-type]
    return config, dataset, pares


def _correr(config: ConfigSuite, comparacion: Any, dataset: Any) -> list[Any]:
    return asyncio.run(
        evaluar_brazos(
            config,
            comparacion,
            dataset,
            RelojFijo(),
            lambda: Cronometro(RelojSimulado()),
            None,
        )
    )


@pytest.fixture(scope="module")
def corrida(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, dict[str, dict[str, Any]]]:
    """La configuración fake de punta a punta (``evaluate``): la carpeta del informe y sus brazos, por nombre."""
    carpeta = tmp_path_factory.mktemp("brazos-pares")
    codigo = main(
        ["--config", str(CONFIG), "--suite", "all", "--report", "json", "--salida", str(carpeta)],
        reloj=RelojFijo(),
        entorno=ENTORNO,
    )
    assert codigo == 0
    informe = json.loads(next(carpeta.glob("*.json")).read_text(encoding="utf-8"))
    return carpeta, {b["nombre"]: b for b in informe["comparacion_recuperacion"]["brazos"]}
