"""Guardas con las que la suite se niega a correr, antes de cargar preguntas o enviar ningún request."""

from __future__ import annotations

from app.evaluation.config_suite import ConfigSuite


class SuiteAbortada(RuntimeError):
    """La suite no corre; el mensaje nombra la causa y nunca un valor de configuración ni un texto."""


def exigir_marca_final(config: ConfigSuite, prueba_final: bool) -> None:
    """ADR-45 P3: el subconjunto de prueba solo se evalúa con ``--prueba-final``."""
    if config.subconjunto == "prueba" and not prueba_final:
        raise SuiteAbortada("el subconjunto de prueba exige --prueba-final (ADR-45 P3)")
