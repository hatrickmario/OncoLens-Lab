"""Guardas con las que la suite se niega a correr, antes de cargar preguntas o enviar ningún request."""

from __future__ import annotations

from collections.abc import Mapping

from app.domain.reglas_proveedor import es_modelo_de_nube, es_proveedor_local
from app.evaluation.config_suite import ConfigJuez, ConfigSuite
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


def exigir_juez_local(juez: ConfigJuez | None) -> None:
    """RN-12, ADR-41: ningún juez de fidelidad sale de la lista local cerrada en código, tampoco con datos sintéticos.

    Se llama antes de cargar preguntas y de crear el cliente del juez: con una URL de nube no sale ningún request.
    """
    if juez is None:
        return
    if juez.base_url is not None and not es_proveedor_local(juez.base_url):
        raise SuiteAbortada("el juez de fidelidad no es un proveedor local (RN-12, ADR-41)")
    if es_modelo_de_nube(juez.modelo):  # un host local puede servir un modelo que corre en la nube
        raise SuiteAbortada("el modelo del juez de fidelidad se ejecuta en la nube (RN-12, ADR-41)")


def exigir_proveedor_local(config: ConfigSuite) -> None:
    """RN-12, US-233a AC-3: con ``proveedor: local`` el generador es un host de la lista local cerrada en código y su
    modelo no se ejecuta en la nube (``x:cloud``), tampoco con datos sintéticos.

    Se llama antes de cargar pesos y de crear el cliente: no sale ningún request. El mensaje nombra el adapter,
    nunca la URL ni el nombre del modelo."""
    if config.proveedor != "local":
        return
    if "llm" not in config.urls:
        raise SuiteAbortada("con proveedor local falta adaptadores.urls.llm")
    if config.rss_limite_mib is None:
        raise SuiteAbortada("con proveedor local falta medicion.rss_limite_mib")
    for adapter, url in sorted(config.urls.items()):
        if not es_proveedor_local(url):
            raise SuiteAbortada(f"el adapter {adapter} no es un proveedor local (RN-12)")
    if es_modelo_de_nube(
        config.llm_modelo
    ):  # un host local puede servir un modelo que corre en la nube
        raise SuiteAbortada("el modelo del adapter llm se ejecuta en la nube (RN-12)")


def exigir_marca_final(config: ConfigSuite, prueba_final: bool) -> None:
    """ADR-45 P3: el subconjunto de prueba solo se evalúa con ``--prueba-final``."""
    if config.subconjunto == "prueba" and not prueba_final:
        raise SuiteAbortada("el subconjunto de prueba exige --prueba-final (ADR-45 P3)")
