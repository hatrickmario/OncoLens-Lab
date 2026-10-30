"""FX-06c-c: población del estudio en abanico (US-242). Solo texto sintético (RN-13, RN-14, RN-21).

Los fakes cumplen el contrato de sus puertos reales (LSP):

* ``RecuperadorFalsoPorDocumento``: por documento, nunca fragmentos de otro; ``relevantes`` respeta ``k``.
* ``FakePopulationLlm``: el JSON crudo y el ``finish_reason`` de un LLM real; un fallo es ``FalloDelLlm``. Registra cada
  llamada (criterio, semilla, fragmentos del prompt, llamadas simultáneas al entrar) sin guardar valores.
* ``NliPorValor``: como ``NliFalso`` pero decide por el valor que lleva la hipótesis (``neutral`` para ``stage I–III``).
"""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from app.application.corpus_metadata.poblacion_puertos import (
    DocumentoParaExtraer,
    Fragmento,
    RespuestaDelLlm,
)
from app.application.ports import FalloDelLlm, ParNli, ResultadoNli
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from tests.support.contract import CATALOGOS
from tests.support.nli_falso import IMPLICA, NEUTRAL
from tests.support.semilla import documento_de_prueba

VERSION_DE_CATALOGO_DE_TEST = "test-apl-1.2.0"
VERSION_DEL_PROMPT_DE_TEST = "poblacion_v1"
VERSION_DEL_MODELO_DE_TEST = "llm-local-de-test"
TOP_K_DE_TEST = 2

FRAGMENTOS_POR_DOCUMENTO: dict[str, tuple[Fragmento, ...]] = {
    "doc-e1": (
        Fragmento(
            "ch-e1-1",
            "Eligibility: eligible patients were premenopausal or postmenopausal women with HER2-positive "
            "early breast cancer, stage I-III, with a performance status of 0 or 1.",
        ),
        Fragmento(
            "ch-e1-2",
            "Results: in the triple-negative subgroup the effect was similar to that of the full population.",
        ),
        Fragmento(
            "ch-e1-3",
            "Discussion: the findings in postmenopausal women agree with earlier reports on this population.",
        ),
    ),
    "doc-e2": (
        Fragmento(
            "ch-e2-1",
            "Eligibility: women with metastatic HER2-positive breast cancer after one prior line of treatment.",
        ),
    ),
}
CRITERIOS_DE_MAMA = (
    "estado_her2",
    "receptores_hormonales",
    "estadio",
    "linea_tratamiento",
    "estado_menopausico",
    "ecog",
)
VALOR_PROHIBIDO = "recommended treatment"
"""Término de nivel A de ``terminos-prohibidos.json``: un valor así nunca debe guardarse (RN-23)."""

Valor = tuple[str, str, str]  # (value, chunkId, scope)
ESCENARIOS: dict[str, dict[str, list[Valor]]] = {
    "EXT-OK": {
        "estado_menopausico": [
            ("premenopausal women", "ch-e1-1", "elegibilidad"),
            ("postmenopausal women", "ch-e1-1", "elegibilidad"),
        ],
        "estado_her2": [("HER2-positive", "ch-e1-1", "elegibilidad")],
        "receptores_hormonales": [("triple-negative", "ch-e1-2", "subgrupo")],
    },
    "EXT-RELLENO": {
        "ecog": [("not found", "none", "elegibilidad")],
        "estadio": [("no expresado", "ch-e1-1", "elegibilidad")],
    },
    "EXT-AJENO": {"estado_her2": [("HER2-positive", "ch-e2-1", "elegibilidad")]},
    "EXT-NLI": {"estadio": [("stage I–III", "ch-e1-1", "elegibilidad")]},
    "EXT-DUP": {
        "estado_menopausico": [
            ("postmenopausal women", "ch-e1-1", "elegibilidad"),
            ("Postmenopausal women", "ch-e1-3", "mencion"),
        ]
    },
    # Cuatro valores del MISMO fragmento, con las menciones primero en la salida (el tope ordena por alcance).
    "EXT-CUATRO": {
        "linea_tratamiento": [
            ("adjuvant setting", "ch-e1-1", "mencion"),
            ("first line", "ch-e1-1", "elegibilidad"),
            ("neoadjuvant setting", "ch-e1-1", "mencion"),
            ("second line", "ch-e1-1", "elegibilidad"),
        ]
    },
    "EXT-SINONIMO": {
        "estado_menopausico": [
            ("postmenopausal women", "ch-e1-1", "elegibilidad"),
            ("Post-menopausal", "ch-e1-3", "mencion"),
        ]
    },
    "EXT-PROHIBIDO": {"ecog": [(VALOR_PROHIBIDO, "ch-e1-1", "elegibilidad")]},
    "EXT-LARGO": {"ecog": [("x" * 201, "ch-e1-1", "elegibilidad")]},
}
CRITERIO_QUE_SE_CORTA = "estado_menopausico"
_CRITERIO_EN_PROMPT = re.compile(r"^Criterio: (\S+)$", re.MULTILINE)
_FRAGMENTO_EN_PROMPT = re.compile(r"^\[(ch-[a-z0-9-]+)\]$", re.MULTILINE)


@dataclass
class LlamadaRegistrada:
    criterio: str
    semilla: int
    max_tokens: int
    chunk_ids: tuple[str, ...]
    simultaneas_al_entrar: int
    longitud_del_prompt: int


@dataclass
class FakePopulationLlm:
    """Escenarios ``EXT-*`` aplicados en orden (el último gana por criterio). ``cortes``: criterio -> cuántas de sus
    primeras llamadas devuelven ``finish_reason = length`` con JSON truncado (``EXT-CORTE`` = 1, ``EXT-CORTE-2`` = 2)."""

    escenarios: Sequence[str] = ("EXT-OK",)
    cortes: Mapping[str, int] = field(default_factory=dict)
    modo_caido: bool = False
    llamadas: list[LlamadaRegistrada] = field(default_factory=list)
    prompts: list[str] = field(default_factory=list)
    salidas: list[str] = field(default_factory=list)
    maximo_simultaneo: int = 0
    _activas: int = 0

    @property
    def invocaciones(self) -> int:
        return len(self.llamadas)

    def llamadas_de(self, criterio: str) -> list[LlamadaRegistrada]:
        return [c for c in self.llamadas if c.criterio == criterio]

    async def completar_json_acotado(
        self, prompt: str, esquema: Mapping[str, Any], *, max_tokens: int, semilla: int
    ) -> RespuestaDelLlm:
        criterio = _CRITERIO_EN_PROMPT.search(prompt)
        assert criterio is not None, "el prompt debe declarar 'Criterio: <clave>'"
        self._activas += 1
        self.maximo_simultaneo = max(self.maximo_simultaneo, self._activas)
        self.llamadas.append(
            LlamadaRegistrada(
                criterio.group(1),
                semilla,
                max_tokens,
                tuple(_FRAGMENTO_EN_PROMPT.findall(prompt)),
                self._activas,
                len(prompt),
            )
        )
        self.prompts.append(prompt)
        try:
            await asyncio.sleep(0)  # cede el turno: con el semáforo las demás tareas esperan
            if self.modo_caido:
                raise FalloDelLlm("llm falso: sin respuesta")
            respuesta = self._responder(criterio.group(1), self.llamadas_de(criterio.group(1)))
            self.salidas.append(respuesta.texto)
            return respuesta
        finally:
            self._activas -= 1

    def _responder(self, criterio: str, previas: list[LlamadaRegistrada]) -> RespuestaDelLlm:
        if len(previas) <= self.cortes.get(criterio, 0):
            return RespuestaDelLlm('{"values": [{"value": "premen', "length")
        valores: list[Valor] = []
        for nombre in self.escenarios:
            valores = ESCENARIOS[nombre].get(criterio, valores)
        return RespuestaDelLlm(
            json.dumps(
                {"values": [{"value": v, "chunkId": c, "scope": s} for v, c, s in valores]},
                ensure_ascii=False,
            ),
            "stop",
        )


class RecuperadorFalsoPorDocumento:
    """Los fragmentos de FX-06c-c por ``document_key``, en el orden ``ch-e1-1``, ``ch-e1-2``, ``ch-e1-3``."""

    def __init__(self) -> None:
        self.consultas: list[tuple[str, str, int]] = []

    def todos(self, documento: DocumentoParaExtraer) -> tuple[Fragmento, ...]:
        return FRAGMENTOS_POR_DOCUMENTO[documento.document_key]

    def relevantes(
        self, documento: DocumentoParaExtraer, criterio: CriterioDeAplicabilidad, k: int
    ) -> tuple[Fragmento, ...]:
        self.consultas.append((documento.document_key, criterio.clave, k))
        return FRAGMENTOS_POR_DOCUMENTO[documento.document_key][:k]


class NliPorValor:
    """``NliClassifier`` falso: ``neutral`` si la hipótesis nombra ``stage I–III``; ``entailment`` en el resto."""

    version = "nli-test@1"

    def __init__(self) -> None:
        self.pares: list[ParNli] = []

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        self.pares.extend(pares)
        return [NEUTRAL if "stage I–III" in par.hipotesis else IMPLICA for par in pares]


def criterios_de_mama() -> tuple[CriterioDeAplicabilidad, ...]:
    """Los seis criterios de mama del catálogo versionado (la fuente que la ingesta lee en producción)."""
    return cargar_criterios_de_aplicabilidad(CATALOGOS, ("mama",)).criterios("mama")


def documentos_e() -> dict[str, Any]:
    """``doc-e1`` y ``doc-e2``: ECA de mama con licencia CC BY y el texto de sus fragmentos (sin metadatos estructurados)."""
    return {
        clave: documento_de_prueba(
            document_key=clave,
            version_group_id=clave,
            source_type="literature",
            source_name="PMC Open Access",
            external_id=f"sintetico-{clave}",
            title=f"Ensayo sintético {clave}",
            language="en",
            study_design="otro",
            license="CC BY 4.0",
            license_url="https://creativecommons.org/licenses/by/4.0/",
            texto=" ".join(f.texto for f in fragmentos),
        )
        for clave, fragmentos in FRAGMENTOS_POR_DOCUMENTO.items()
    }
