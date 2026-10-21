"""Guardas con las que la suite se niega a correr, antes de cargar preguntas o enviar ningún request."""

from __future__ import annotations

from collections.abc import Mapping

from app.domain.reglas_proveedor import es_proveedor_local
from app.evaluation.config_suite import ConfigSuite
from app.evaluation.dataset_loader import CLASE_SINTETICA


class SuiteAbortada(RuntimeError):
    """La suite no corre; el mensaje nombra la causa y nunca un valor de configuración ni un texto."""


def exigir_adapters_locales(clase_dataset: str, urls: Mapping[str, str]) -> None:
    """RN-12: con datos que no son ``sintetico``, todo adapter con URL debe ser local; si no, la suite aborta.

    Se llama antes de cargar preguntas y de crear ningún cliente, de modo que no sale ningún request.
    """
    if clase_dataset == CLASE_SINTETICA:
        return
    remotos = sorted(adapter for adapter, url in urls.items() if not es_proveedor_local(url))
    if remotos:
        raise SuiteAbortada(
            f"con datos '{clase_dataset}' todo adapter debe ser local; no lo es: {', '.join(remotos)} (RN-12)"
        )


def exigir_marca_final(config: ConfigSuite, prueba_final: bool) -> None:
    """ADR-45 P3: el subconjunto de prueba solo se evalúa con ``--prueba-final``."""
    if config.subconjunto == "prueba" and not prueba_final:
        raise SuiteAbortada("el subconjunto de prueba exige --prueba-final (ADR-45 P3)")
