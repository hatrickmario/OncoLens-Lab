"""Configuración de logging: lo que ningún log debe registrar (RN-10)."""

import logging


def silenciar_urls_de_httpx_en_logs() -> None:
    # httpx y httpcore registran la URL de cada petición; la del LLM no debe llegar a los logs.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def configurar_logging_json(nivel: int = logging.INFO) -> logging.Handler:
    raise NotImplementedError("no implementado")
