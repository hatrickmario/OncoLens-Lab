"""Evaluación del chat (US-269, OL-06): ``chat-v1`` sobre el grafo de PRODUCCIÓN, en proceso.

``python -m app.evaluation.chat --config <ruta> [--dataset <dir>] [--peticiones <dir>] [--salida <dir>]``.
"""

from __future__ import annotations

import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.application.ports import ProhibitedTermsChecker
from app.evaluation.config_suite import ConfigSuite
from app.evaluation.dataset_chat import DatasetDeChat
from app.schemas.generated.models import ChatTurnRequest


@dataclass(frozen=True)
class PeticionDeChat:
    """Lo que ``clinical-api`` prepara por caso: la petición desidentificada, la traducción clave del seed → ``factRef`` y
    los textos de identidad que NO deben aparecer en ninguna parte (solo para contarlos)."""

    peticion: ChatTurnRequest
    hechos_por_clave: Mapping[str, str]
    identidad: tuple[str, ...] = ()


@dataclass(frozen=True)
class PuertosDeChat:
    """Lo que un test puede sustituir del grafo de producción (por defecto, el filtro de RN-23 de la suite)."""

    verificador_terminos: ProhibitedTermsChecker | None = None


def identidad_de_prueba() -> tuple[str, ...]:
    raise NotImplementedError("no implementado")


def peticiones_de_ejemplo(dataset: DatasetDeChat, config: ConfigSuite) -> dict[str, PeticionDeChat]:
    raise NotImplementedError("no implementado")


async def evaluar(
    config: ConfigSuite,
    dataset: DatasetDeChat,
    peticiones: Mapping[str, PeticionDeChat],
    *,
    puertos: PuertosDeChat | None = None,
) -> dict[str, Any]:
    raise NotImplementedError("no implementado")


def codigo_de_salida(reporte: Mapping[str, Any]) -> int:
    raise NotImplementedError("no implementado")


def main(argv: Sequence[str]) -> int:
    raise NotImplementedError("no implementado")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
