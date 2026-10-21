"""CLI de la medicion de ADR-40 (US-013 AC-1): ``python -m app.scripts.adr40 [--out reports/adr40]``.

Mide tres configuraciones sobre ``data/eval/pii-mini`` y aplica la regla de eleccion de design D2:
``1-base`` (solo ``config/pii-formats.json``; referencia, no elegible), ``1`` (patrones configurables del repo mas
``formatos_b2.json``) y ``2`` (``1`` mas el NER spaCy ``es_core_news_md``). Escribe un JSON de agregados, sin textos ni
valores de PII. Minimo, margen de memoria, remuestreos y modelo son parametros (RN-22), no constantes del algoritmo.
Codigos de salida: 0 hay candidato elegido · 2 dataset invalido · 3 modelo NER no disponible (candidato 2 sin medir) ·
4 ningun candidato cumple (el ADR lo declara y escala al usuario, D2.4).
"""

from __future__ import annotations

import argparse
import platform
import sys
import time
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import psutil

from app.evaluation.reporte import escribir_reporte
from app.evaluation.rutas import raiz_repo
from app.scripts.adr40.dataset import DatasetInvalido, TextoSembrado, cargar_corpus
from app.scripts.adr40.detectores import (
    DetectorConNer,
    DetectorDePatrones,
    DetectorPii,
    cargar_canalizacion_spacy,
    cargar_formatos,
)
from app.scripts.adr40.medicion import medir_candidato
from app.scripts.adr40.reglas import TOTAL, Decision, Medicion, elegir_mas_simple_que_cumple

SALIDA_OK, SALIDA_DATASET, SALIDA_SIN_NER, SALIDA_NINGUNO_CUMPLE = 0, 2, 3, 4
FORMATOS_B2 = Path(__file__).resolve().parent / "formatos_b2.json"
BYTES_POR_MB = 1024 * 1024
Ahora = Callable[[], datetime]


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m app.scripts.adr40", description=__doc__)
    p.add_argument("--out", type=Path, default=Path("reports/adr40"))
    p.add_argument("--minimo", type=float, default=0.95, help="sensibilidad minima por tipo (G-8)")
    p.add_argument(
        "--cobertura", type=float, default=0.5, help="fraccion del span cubierta para contar"
    )
    p.add_argument("--corridas", type=int, default=3)
    p.add_argument("--remuestreos", type=int, default=1000)
    p.add_argument("--semilla", type=int, default=13)
    p.add_argument(
        "--margen-memoria-mb", type=float, default=727.0, help="0,71 GB de margen (ADR-39 fase B)"
    )
    p.add_argument("--ner-modelo", default="es_core_news_md")
    p.add_argument("--ner-version", default="3.8.0")
    return p


def _rss_mb() -> float:
    return psutil.Process().memory_info().rss / BYTES_POR_MB


CargadorNer = Callable[[str, str], "tuple[Any, float] | None"]


def cargar_ner(modelo: str, version: str) -> tuple[Any, float] | None:
    """Canalizacion de spaCy y memoria (MB de RSS) que costo cargarla; ``None`` si el modelo no esta instalado."""
    antes = _rss_mb()
    try:
        canalizacion = cargar_canalizacion_spacy(modelo, version)
    except (ImportError, OSError, ValueError) as error:
        print(f"candidato 2 sin medir: {type(error).__name__}", file=sys.stderr)
        return None
    return canalizacion, _rss_mb() - antes


def _decidir(candidatos: dict[str, dict[str, Any]], argumentos: argparse.Namespace) -> Decision:
    mediciones = [
        Medicion(
            id_c,
            {tipo: m["valor"] for tipo, m in c["sensibilidad_documentos"].items()},
            c.get("memoria_carga_mb"),
            elegible=id_c != "1-base",
        )
        for id_c, c in candidatos.items()
    ]
    tipos = [t for t in mediciones[0].sensibilidad if t != TOTAL] + [TOTAL]
    return elegir_mas_simple_que_cumple(
        mediciones, argumentos.minimo, tipos, argumentos.margen_memoria_mb
    )


def _armar_detectores(
    raiz: Path, ner: tuple[Any, float] | None
) -> dict[str, tuple[DetectorPii, float | None]]:
    """Del mas simple al mas complejo; el segundo valor es la memoria de carga (``None`` si no carga modelo)."""
    formatos_repo = raiz / "config" / "pii-formats.json"
    ampliado = DetectorDePatrones(cargar_formatos([formatos_repo, FORMATOS_B2]))
    detectores: dict[str, tuple[DetectorPii, float | None]] = {
        "1-base": (DetectorDePatrones(cargar_formatos([formatos_repo])), None),
        "1": (ampliado, None),
    }
    if ner is not None:
        detectores["2"] = (DetectorConNer(ampliado, ner[0]), ner[1])
    return detectores


def _medir_candidatos(
    detectores: dict[str, tuple[DetectorPii, float | None]],
    textos: Sequence[TextoSembrado],
    argumentos: argparse.Namespace,
) -> dict[str, dict[str, Any]]:
    return {
        id_c: {
            **medir_candidato(
                detector,
                textos,
                corridas=argumentos.corridas,
                minimo_cobertura=argumentos.cobertura,
                remuestreos=argumentos.remuestreos,
                semilla=argumentos.semilla,
                reloj=time.perf_counter,
            ),
            "memoria_carga_mb": memoria,
        }
        for id_c, (detector, memoria) in detectores.items()
    }


def _armar_reporte(
    argumentos: argparse.Namespace,
    ahora: datetime,
    n_textos: int,
    ner_medido: bool,
    candidatos: dict[str, dict[str, Any]],
    decision: Decision,
) -> dict[str, Any]:
    return {
        "fecha": ahora.isoformat(),
        "equipo": {"sistema": platform.platform(), "python": platform.python_version()},
        "dataset": {"nombre": "pii-mini", "n_textos": n_textos, "clase": "sintetico"},
        "criterio": {
            "minimo": argumentos.minimo,
            "cobertura": argumentos.cobertura,
            "margen_memoria_mb": argumentos.margen_memoria_mb,
        },
        "modelo_ner": {
            "nombre": argumentos.ner_modelo,
            "version": argumentos.ner_version,
            "medido": ner_medido,
        },
        "candidatos": candidatos,
        "decision": {
            "elegido": decision.elegido,
            "descartes": [{"candidato": c, "motivo": m} for c, m in decision.descartes],
        },
    }


def ejecutar(
    argumentos: argparse.Namespace,
    textos: Sequence[TextoSembrado],
    ahora: Ahora,
    raiz: Path,
    cargador_ner: CargadorNer = cargar_ner,
) -> int:
    ner = cargador_ner(argumentos.ner_modelo, argumentos.ner_version)
    candidatos = _medir_candidatos(_armar_detectores(raiz, ner), textos, argumentos)
    decision = _decidir(candidatos, argumentos)
    reporte = _armar_reporte(
        argumentos, ahora(), len(textos), ner is not None, candidatos, decision
    )
    escribir_reporte(argumentos.out / "medicion.json", reporte)
    if decision.elegido is not None:
        return SALIDA_OK
    return SALIDA_SIN_NER if ner is None else SALIDA_NINGUNO_CUMPLE


def main(argv: Sequence[str] | None = None, ahora: Ahora = lambda: datetime.now(UTC)) -> int:
    argumentos = _parser().parse_args(argv)
    try:
        textos = cargar_corpus()
    except DatasetInvalido as error:
        print(f"dataset invalido: {error}", file=sys.stderr)
        return SALIDA_DATASET
    return ejecutar(argumentos, textos, ahora, raiz_repo())
