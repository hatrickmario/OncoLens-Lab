"""Reglas únicas de la familia chat (Gate 2 de L1D-326): posiciones de chunks e intenciones medibles."""

import asyncio
from types import SimpleNamespace

import pytest

from app.application.chat.posiciones import posiciones_por_documento
from app.domain.chat.estado import Intencion
from app.evaluation import chat
from app.evaluation.adaptadores_falsos import PosicionesDelDataset
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.dataset_chat import INTENCIONES, cargar_dataset_de_chat
from app.evaluation.rutas import raiz_repo
from app.infrastructure.fake.fake_chat_turn import _PosicionesDelAnalisis

CONFIG = raiz_repo() / "apps/rag-orchestrator/eval/configs/chat-fake.yaml"
MAPAS = [
    {"doc-a": ["a1", "a2", "a3"], "doc-b": ["b1"]},
    {"doc-unico": ["u1"]},
    {},
]


def test_posiciones_por_documento_cuenta_desde_1_y_da_la_cantidad_cuando_el_documento_tiene_varios_chunks():
    posiciones = posiciones_por_documento(MAPAS[0])

    assert (posiciones["a2"].ordinal, posiciones["a2"].cantidad) == (2, 3)
    assert (posiciones["b1"].ordinal, posiciones["b1"].cantidad) == (1, 1)
    assert "zzz" not in posiciones


@pytest.mark.parametrize("mapa", MAPAS)
def test_los_dos_fakes_de_posiciones_dan_lo_mismo_cuando_reciben_el_mismo_mapa_documento_chunks(
    mapa,
):
    chunks = [c for documento, ids in mapa.items() for c in ids]
    dataset = SimpleNamespace(
        chunks=[SimpleNamespace(id=c, documento=d) for d, ids in mapa.items() for c in ids]
    )
    analisis = SimpleNamespace(
        evidenceOptions=[
            SimpleNamespace(citedSources=[SimpleNamespace(externalId=d, chunkId=c) for c in ids])
            for d, ids in mapa.items()
        ]
    )
    pedidos = [*chunks, "inexistente"]

    del_dataset = PosicionesDelDataset(dataset).posiciones(pedidos)  # type: ignore[arg-type]
    del_analisis = _PosicionesDelAnalisis(analisis).posiciones(pedidos)  # type: ignore[arg-type]

    assert del_dataset == del_analisis == posiciones_por_documento(mapa)


def test_las_intenciones_medibles_son_las_del_dominio_y_la_latencia_las_publica_todas():
    dataset = cargar_dataset_de_chat(raiz_repo() / "data" / "eval" / "chat-v1")
    config = cargar_config_suite(CONFIG)

    reporte = asyncio.run(
        chat.evaluar(config, dataset, chat.peticiones_de_ejemplo(dataset, config))
    )

    assert set(INTENCIONES) <= {i.value for i in Intencion}
    assert set(reporte["metricas"]["latencia"]["por_intencion"]) == set(INTENCIONES)
