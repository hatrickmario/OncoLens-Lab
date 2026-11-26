"""Los brazos de reescritura y de pares del reranker (US-277 AC-5, AC-6; l1d-335 tarea 4.2).

Todo con adapters falsos: la reescritura efectiva se mide en el PUERTO del reescritor (fingido) y los pares en lo que llega al
reranker. La corrida con modelos locales es de la corrida final del S7; las cifras de estos tests no dicen nada del RAG real.
"""

from __future__ import annotations

import asyncio
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.application.ports import FalloDeInferencia
from app.evaluation.adaptadores_falsos import RerankerLexico
from app.evaluation.brazos_recuperacion import Brazo
from app.evaluation.composicion_suite import Adaptadores, adaptadores_de_suite
from app.evaluation.config_suite import ConfigInvalida, ConfigSuite, cargar_config_suite
from app.evaluation.corrida_brazos import ResultadoDeBrazo, evaluar_brazos
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.fuente_dataset import DatasetSuite, FuenteDatasetEnDirectorio
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.parafrasis_de_la_comparacion import con_parafrasis
from app.evaluation.reescritura_del_brazo import reescritura_efectiva_coincide
from app.schemas.generated.models import RetrievalMode
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "s7-reranker-ventanas-fake.yaml"
ENTORNO = {"STACK_MEMORY_LIMIT_GB": "30"}
DENSA = RetrievalMode.dense
LARGO_DEL_RERANKER_FALSO = {
    "reranker_modo": "primera",
    "reranker_solape": 2,
    "reranker_max_length": 12,
}

# SHA-256 de los tres brazos de ``s7-reranker-ventanas-fake.yaml`` ANTES de que ``Brazo`` ganara ``reranker_max_pairs`` y
# ``query_rewrite_enabled``: capturados de ``main`` (189deb20). No deben cambiar.
HUELLAS_DE_LOS_BRAZOS_EXISTENTES = {
    "A0": "1b73f6a2e8a0cf299fabf7e437230450d246ad2820cc17e1e8b52b837027e196",
    "A0-maximo": "ec2d42a3d29dbd775ed5919cd948da6d7ccc8a697ade58fca39f617c428a4655",
    "A0-longitud-ampliada": "fd9a3cd2bd9d8101b7d27aa93d4a03cf745120f48a8a53bb8252244201196cfa",
}


class _CandidatoFalso:
    def __init__(self, texto: str) -> None:
        self.chunk_id, self.document_id, self.chunk_text, self.similitud_dense = (
            texto,
            "d",
            texto,
            0.1,
        )


def _mundo() -> tuple[ConfigSuite, DatasetSuite]:
    config = cargar_config_suite(CONFIG, ENTORNO)
    base = FuenteDatasetEnDirectorio(config.dataset).cargar()
    dataset, _ = con_parafrasis(base, config.comparacion.parafrasis)  # type: ignore[arg-type]
    return config, dataset


def _evaluar(
    config: ConfigSuite,
    dataset: DatasetSuite,
    brazos: tuple[Brazo, ...],
    adaptadores: Adaptadores | None = None,
) -> list[ResultadoDeBrazo]:
    comparacion = replace(config.comparacion, brazos=brazos)  # type: ignore[type-var]
    return asyncio.run(
        evaluar_brazos(
            config,
            comparacion,
            dataset,
            RelojFijo(),
            lambda: Cronometro(RelojSimulado()),
            None,
            adaptadores=adaptadores,
        )
    )


def _config_con_brazo(tmp_path: Path, brazo: dict[str, Any]) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["comparacion"]["brazos"] = [crudo["comparacion"]["brazos"][0], brazo]
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


# --- el brazo y su huella ----------------------------------------------------------------------------------------------


def test_la_huella_de_los_brazos_existentes_no_cambia_con_los_campos_nuevos() -> None:
    config = cargar_config_suite(CONFIG, ENTORNO)

    huellas = {b.nombre: b.huella() for b in config.comparacion.brazos}  # type: ignore[union-attr]

    assert huellas == HUELLAS_DE_LOS_BRAZOS_EXISTENTES


def test_la_huella_cambia_cuando_un_brazo_declara_los_pares_o_la_reescritura() -> None:
    huellas = {
        Brazo("A0", DENSA).huella(),
        Brazo("A0", DENSA, reranker_max_pairs=20).huella(),
        Brazo("A0", DENSA, reranker_max_pairs=30).huella(),
        Brazo("A0", DENSA, query_rewrite_enabled=True).huella(),
        Brazo("A0", DENSA, query_rewrite_enabled=False).huella(),
    }

    assert (
        len(huellas) == 5
    )  # apagar la reescritura de forma explícita no es lo mismo que no declararla


# --- la configuración --------------------------------------------------------------------------------------------------


def test_la_configuracion_lee_los_pares_y_la_reescritura_de_cada_brazo(tmp_path: Path) -> None:
    ruta = _config_con_brazo(
        tmp_path,
        {
            "nombre": "A0-reescritura-30",
            "RETRIEVAL_MODE": "dense",
            "RERANKER_MAX_PAIRS": 30,
            "QUERY_REWRITE_ENABLED": True,
        },
    )

    brazo = cargar_config_suite(ruta, ENTORNO).comparacion.brazos[1]  # type: ignore[union-attr]

    assert (brazo.reranker_max_pairs, brazo.query_rewrite_enabled) == (30, True)


@pytest.mark.parametrize(
    ("campos", "clave"),
    [
        ({"RERANKER_MAX_PAIRS": 0}, "RERANKER_MAX_PAIRS"),
        ({"RERANKER_MAX_PAIRS": 2.5}, "RERANKER_MAX_PAIRS"),
        ({"RERANKER_MAX_PAIRS": True}, "RERANKER_MAX_PAIRS"),
        ({"QUERY_REWRITE_ENABLED": "si"}, "QUERY_REWRITE_ENABLED"),
        ({"QUERY_REWRITE_ENABLED": 1}, "QUERY_REWRITE_ENABLED"),
    ],
)
def test_un_brazo_con_un_valor_invalido_se_rechaza_nombrando_la_clave_y_no_el_valor(
    tmp_path: Path, campos: dict[str, Any], clave: str
) -> None:
    ruta = _config_con_brazo(tmp_path, {"nombre": "A0-x", "RETRIEVAL_MODE": "dense", **campos})

    with pytest.raises(ConfigInvalida) as error:
        cargar_config_suite(ruta, ENTORNO)

    assert clave in str(error.value)


# --- los pares que llegan al reranker ----------------------------------------------------------------------------------


@pytest.mark.ac("US-277", 6)
def test_el_brazo_de_30_pares_envia_al_reranker_hasta_30_candidatos_y_el_vigente_hasta_su_tope() -> (
    None
):
    config, dataset = _mundo()
    assert config.umbrales.retrieval_top_k >= 30 and len(dataset.chunks) > 30

    vigente, treinta = _evaluar(
        config,
        dataset,
        (
            Brazo("A0", DENSA, reranker_max_pairs=20),
            Brazo("A0-30", DENSA, reranker_max_pairs=30),
        ),
    )

    def mayor_envio(brazo: ResultadoDeBrazo) -> int:
        return max(len(ranking) for ranking in brazo.servicio.observaciones.rankings.values())

    assert (mayor_envio(vigente), mayor_envio(treinta)) == (20, 30)
    assert [vigente.reranker.max_pairs, treinta.reranker.max_pairs] == [20, 30]  # type: ignore[union-attr]


def test_el_reranker_falso_con_tope_de_pares_rechaza_mas_candidatos_con_el_error_del_puerto() -> (
    None
):
    con_tope = RerankerLexico(max_pairs=2)
    candidatos = [_CandidatoFalso("a"), _CandidatoFalso("b"), _CandidatoFalso("c")]

    with pytest.raises(FalloDeInferencia):
        con_tope.puntuar("pregunta", candidatos)

    assert len(con_tope.variante(max_pairs=3).puntuar("pregunta", candidatos)) == 3
    assert RerankerLexico().variante().configuracion.max_pairs is None  # sin tope: como antes


def test_un_brazo_sin_pares_declarados_conserva_el_corte_de_la_suite() -> None:
    config, dataset = _mundo()

    (sin_corte,) = _evaluar(config, dataset, (Brazo("A0", DENSA),))

    assert max(len(r) for r in sin_corte.servicio.observaciones.rankings.values()) == 30


# --- la reescritura efectiva -------------------------------------------------------------------------------------------


@pytest.mark.ac("US-277", 5)
def test_el_brazo_con_reescritura_invoca_al_reescritor_en_cada_consulta_sin_evidencia_y_el_apagado_nunca() -> (
    None
):
    config, dataset = _mundo()

    apagado, encendido = _evaluar(
        config,
        dataset,
        (
            Brazo("A0", DENSA, query_rewrite_enabled=False, **LARGO_DEL_RERANKER_FALSO),
            Brazo("A0-reescritura", DENSA, query_rewrite_enabled=True, **LARGO_DEL_RERANKER_FALSO),
        ),
    )

    sin_evidencia = sum(r.sin_evidencia for r in encendido.resultados)
    assert sin_evidencia > 0
    assert apagado.servicio.observaciones.reescrituras == 0
    assert encendido.servicio.observaciones.reescrituras >= sin_evidencia


@pytest.mark.ac("US-277", 5)
def test_la_suite_aborta_nombrando_el_brazo_cuando_la_reescritura_efectiva_no_es_la_que_declara() -> (
    None
):
    config, dataset = _mundo()
    sin_reescritor = replace(adaptadores_de_suite(config, dataset, None), reescritor=None)

    with pytest.raises(SuiteAbortada, match="A0-reescritura"):
        _evaluar(
            config,
            dataset,
            (
                Brazo("A0", DENSA, **LARGO_DEL_RERANKER_FALSO),
                Brazo(
                    "A0-reescritura", DENSA, query_rewrite_enabled=True, **LARGO_DEL_RERANKER_FALSO
                ),
            ),
            sin_reescritor,
        )


def test_un_brazo_que_no_declara_la_reescritura_no_la_activa() -> None:
    config, dataset = _mundo()

    (a0,) = _evaluar(config, dataset, (Brazo("A0", DENSA),))

    assert a0.servicio.observaciones.reescrituras == 0


@pytest.mark.parametrize(
    ("esperada", "invocaciones", "sin_evidencia", "coincide"),
    [
        (False, 0, True, True),
        (False, 0, False, True),
        (False, 1, True, False),
        (True, 1, True, True),
        (True, 0, True, False),
        (True, 0, False, True),  # el primer loop alcanzó el umbral: no hay segundo loop
        (True, 2, True, True),
    ],
)
def test_la_reescritura_efectiva_coincide_con_la_del_brazo_solo_si_se_invoco_exactamente_cuando_correspondia(
    esperada: bool, invocaciones: int, sin_evidencia: bool, coincide: bool
) -> None:
    assert reescritura_efectiva_coincide(esperada, invocaciones, sin_evidencia) is coincide
