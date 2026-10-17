"""Rutas del repositorio, en un solo lugar para el paquete de evaluación y sus scripts."""

from __future__ import annotations

from pathlib import Path


def raiz_repo() -> Path:
    """Raíz del repo: ``apps/rag-orchestrator/app/evaluation/rutas.py`` queda cuatro niveles por debajo."""
    return Path(__file__).resolve().parents[4]
