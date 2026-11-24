"""Vocabulario compartido de los brazos del reranker (US-278): una definición de los modos y de los estados de viabilidad.

Cada valor de ``ModoDeVentanas`` tiene que atravesar la carga de la configuración Y el esquema cerrado del informe; los estados
y motivos de la viabilidad salen de ``viabilidad_del_brazo``. Todo con adapters falsos.
"""

from __future__ import annotations

from pathlib import Path
from typing import get_args

import pytest
import yaml

from app.domain.ventanas_del_reranker import MODOS_DE_VENTANAS, ModoDeVentanas
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.metas import CLAVE_P95, cargar_metas
from app.evaluation.viabilidad_del_brazo import (
    ESTADOS_DE_VIABILIDAD,
    MOTIVOS_DE_NO_VIABILIDAD,
    viabilidad_del_brazo,
)
from tests.evaluation.conftest import RAIZ_APP
from tests.evaluation.test_reranker_ventanas_aceptacion import (
    CONFIG,
    LIMITE_DE_MEMORIA,
    brazos_del_informe,
    correr,
)

METAS_INICIALES = RAIZ_APP / "eval" / "configs" / "metas-iniciales.yaml"


def _config_con_modo(tmp_path: Path, modo: str) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["comparacion"]["brazos"][1]["RERANKER_CHUNK_WINDOWS"] = modo
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


@pytest.mark.parametrize("modo", get_args(ModoDeVentanas))
def test_cada_modo_de_ventanas_pasa_la_carga_de_la_configuracion_y_el_esquema_del_informe(
    tmp_path: Path, modo: str
) -> None:
    ruta = _config_con_modo(tmp_path, modo)
    config = cargar_config_suite(ruta, LIMITE_DE_MEMORIA)
    salida = tmp_path / "salida"

    codigo = correr(ruta, salida)

    assert config.comparacion.brazos[1].reranker_modo == modo  # type: ignore[union-attr]
    assert codigo == 0
    assert brazos_del_informe(salida)["A0-maximo"]["reranker"]["modo"] == modo


def test_los_modos_del_esquema_son_los_del_dominio() -> None:
    assert set(MODOS_DE_VENTANAS) == set(get_args(ModoDeVentanas))


def test_los_estados_y_motivos_de_la_viabilidad_son_los_que_la_regla_puede_devolver() -> None:
    estados = {
        viabilidad_del_brazo(
            p95_consulta_s=p95,
            tope_p95_s=20.0,
            memoria_del_stack_gb=memoria,
            limite_memoria_gb=30.0,
        )
        for p95, memoria in ((1.0, 1.0), (21.0, 1.0), (1.0, 31.0), (None, 1.0))
    }

    assert {v.estado for v in estados} == ESTADOS_DE_VIABILIDAD
    assert {m for v in estados for m in v.motivos} == MOTIVOS_DE_NO_VIABILIDAD


def test_un_p95_igual_a_la_meta_del_yaml_real_es_viable_y_apenas_por_encima_no() -> None:
    tope = cargar_metas(METAS_INICIALES)[CLAVE_P95].maximo
    config = cargar_config_suite(CONFIG, LIMITE_DE_MEMORIA)
    assert tope is not None
    assert config.comparacion.viabilidad.tope_p95_s == tope  # type: ignore[union-attr]

    def _estado(p95: float) -> str:
        return viabilidad_del_brazo(
            p95_consulta_s=p95,
            tope_p95_s=tope,
            memoria_del_stack_gb=1.0,
            limite_memoria_gb=30.0,
        ).estado

    assert _estado(tope) == "viable"
    assert _estado(tope + 0.001) == "no_viable"
