"""El informe de la comparación de las variantes de contexto del chunk (US-279 AC-5; l1d-337 tarea 2.1).

Todo con adapters falsos: la corrida con modelos locales es de la corrida final del S7 (tarea 3.2). Las cifras de estos tests no dicen
nada del RAG real. Sin texto de preguntas, de chunks ni de prefijos en el informe (RN-14).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "s7-contexto-fake.yaml"
ENTORNO = {"STACK_MEMORY_LIMIT_GB": "30"}
BRAZOS = ["A0", "A0-determinista", "A0-llm"]
VARIANTES = ["ninguno", "determinista", "llm"]


@pytest.fixture(scope="module")
def corrida(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, dict[str, Any]]:
    """La configuración fake de punta a punta (``evaluate``): la carpeta del informe y su sección de comparación."""
    carpeta = tmp_path_factory.mktemp("contexto-del-chunk")
    codigo = main(
        ["--config", str(CONFIG), "--suite", "all", "--report", "json", "--salida", str(carpeta)],
        reloj=RelojFijo(),
        entorno=ENTORNO,
    )
    assert codigo == 0
    informe = json.loads(next(carpeta.glob("*.json")).read_text(encoding="utf-8"))
    return carpeta, informe["comparacion_recuperacion"]


@pytest.mark.ac("US-279", 5)
def test_el_reporte_trae_los_tres_brazos_con_sus_metricas_la_diferencia_frente_a_ninguno_y_la_marca_de_la_regla_de_adopcion(
    corrida: tuple[Path, dict[str, Any]],
) -> None:
    """[US-279 AC-5] Los tres brazos con recall, MRR, falsos «sin evidencia», paráfrasis, p95, construcción del índice, memoria y la regla."""
    _, comparacion = corrida
    por_nombre = {b["nombre"]: b for b in comparacion["brazos"]}

    assert list(por_nombre) == BRAZOS
    for nombre, variante in zip(BRAZOS, VARIANTES, strict=True):
        brazo = por_nombre[nombre]
        assert "contexto" in brazo, nombre
        assert brazo["contexto"]["variante"] == variante
        assert {"recall_at_10", "mrr"} <= set(brazo["recuperacion"]["total"])
        assert {"n", "total"} == set(brazo["falsos_sin_evidencia"])
        assert {"pares", "recuperadas"} == set(brazo["parafrasis"])
        assert "consulta_p95" in brazo["latencia_ms"]
        assert (
            "memoria_gb" in brazo["viabilidad"]
        )  # sin la memoria medida del stack: null, nunca 0.0
        assert brazo["contexto"]["indice"]["construccion_s"] > 0
    for nombre in BRAZOS[1:]:
        brazo = por_nombre[nombre]
        diferencia = brazo["contexto"]["diferencia_pareada"]["recall_at_10_total"]
        assert set(diferencia) == {"diferencia", "ic95"}
        assert set(diferencia["ic95"]) == {"inferior", "superior"}
        assert set(brazo["contexto"]["regla_de_adopcion"]) == {"cumple", "motivos"}
        assert "diferencia_frente_a_a0" in brazo
    assert "diferencia_pareada" not in por_nombre["A0"]["contexto"]
    assert "regla_de_adopcion" not in por_nombre["A0"]["contexto"]


@pytest.mark.ac("US-279", 5)
def test_cada_brazo_registra_la_variante_la_version_de_la_plantilla_la_coleccion_y_el_llm_solo_en_llm(
    corrida: tuple[Path, dict[str, Any]],
) -> None:
    """[US-279 AC-5] Variante, versión de la plantilla y colección leída por brazo; modelo, prompt y respaldos solo en ``llm``; y la colección de origen."""
    _, comparacion = corrida
    por_nombre = {b["nombre"]: b for b in comparacion["brazos"]}

    for brazo in por_nombre.values():
        assert brazo["contexto"]["version_de_la_plantilla"] >= 1
        assert brazo["contexto"]["coleccion"] is None  # en memoria: no hay colección de Milvus
    assert "llm" not in por_nombre["A0"]["contexto"]
    assert "llm" not in por_nombre["A0-determinista"]["contexto"]
    llm = por_nombre["A0-llm"]["contexto"]["llm"]
    assert set(llm) == {"modelo", "version_del_prompt", "chunks_con_respaldo"}
    assert llm["modelo"] == "fake-guion@1"
    assert set(llm["chunks_con_respaldo"]) == {"salida_invalida", "llm_no_disponible"}
    assert "coleccion_de_origen" in comparacion["contexto"]


@pytest.mark.ac("US-279", 5)
def test_el_informe_marca_la_regla_de_adopcion_sin_adoptar_nada(
    corrida: tuple[Path, dict[str, Any]],
) -> None:
    """[US-279 AC-5] El informe evalúa la regla de adopción por brazo; no cambia ningún valor por defecto."""
    _, comparacion = corrida

    reglas = {b["nombre"]: b["contexto"].get("regla_de_adopcion") for b in comparacion["brazos"]}

    assert reglas["A0"] is None
    for nombre in BRAZOS[1:]:
        assert reglas[nombre]["cumple"] in (True, False, None)
        assert all(isinstance(m, str) for m in reglas[nombre]["motivos"])
    from app.domain.corpus_seed.contexto_del_chunk import VARIANTE_INICIAL

    assert VARIANTE_INICIAL.value == "ninguno"


def test_el_informe_no_lleva_texto_de_chunks_ni_de_preguntas(
    corrida: tuple[Path, dict[str, Any]],
) -> None:
    contenido = next(corrida[0].glob("*.json")).read_text(encoding="utf-8")

    assert "Frase de contexto" not in contenido and " | " not in contenido
