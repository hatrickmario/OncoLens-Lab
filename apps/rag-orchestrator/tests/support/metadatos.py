"""FX-06c-b ampliada (US-118, L1D-117): LLM de metadatos falso, NLI falso y lote sintético para la muestra humana.

Los fakes cumplen el contrato de sus puertos reales (LSP): ``FakeMetadataLlm`` devuelve el texto crudo de un JSON o lanza
``FalloDelLlm`` (como ``OpenAICompatibleLlmClient``); el NLI es el ``NliFalso`` común, que lanza ``FalloDeInferencia`` y
nunca devuelve ``None``. Solo texto sintético: ningún dato de pacientes ni contenido de NCCN o ESMO (RN-14, RN-21).
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import date
from typing import Any, Literal

from app.application.ports import FalloDelLlm
from app.domain.corpus_metadata.verbalizacion import verbalizar_metadato
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso

UMBRAL_NLI_DE_TEST = 0.5

# Frases de cada texto de FX-06c-b que identifican al documento dentro del prompt (el LLM recibe solo el prompt).
MARCADOR_I_CT_1 = "Resumen sintético de un ensayo sobre cáncer de próstata metastásico"
MARCADOR_I_LIT_1 = "Synthetic review about breast cancer systemic options"
MARCADOR_I_LIT_2 = "Synthetic observational article about prostate cancer follow up"

# Un criterio de valoración que el texto de la fuente NO respalda: el NLI falso lo marca ``neutral`` (AC-3).
ENDPOINT_INVENTADO = "reducción del 90 % de la mortalidad a un año"

PROPUESTA_I_LIT_1: dict[str, Any] = {
    "study_design": "eca",
    "trial_phase": "III",
    "sample_size": 500,
    "primary_endpoint": ENDPOINT_INVENTADO,
    "population_criteria": {"estadio": "I–III", "biomarcadores": {"her2": "positivo"}},
}
PROPUESTAS_FX_06C_B: dict[str, dict[str, Any]] = {MARCADOR_I_LIT_1: PROPUESTA_I_LIT_1}

Modo = Literal["ok", "error", "json_invalido", "fuera_de_esquema"]


class FakeMetadataLlm:
    """``LlmClient`` de metadatos: una propuesta por documento (se reconoce por una frase de su texto en el prompt).

    ``por_defecto`` es lo que propone para cualquier otro documento (``{}`` = no propone nada). Registra cada prompt.
    """

    def __init__(
        self,
        propuestas: Mapping[str, Mapping[str, Any]] | None = None,
        *,
        por_defecto: Mapping[str, Any] | None = None,
        modo: Modo = "ok",
    ) -> None:
        self._propuestas = dict(PROPUESTAS_FX_06C_B if propuestas is None else propuestas)
        self.por_defecto = dict(por_defecto or {})
        self.modo = modo
        self.prompts: list[str] = []
        self.esquemas: list[Mapping[str, Any]] = []

    @property
    def invocaciones(self) -> int:
        return len(self.prompts)

    def invocaciones_de(self, marcador: str) -> int:
        return sum(1 for prompt in self.prompts if marcador in prompt)

    async def completar_json(self, prompt: str, esquema: Mapping[str, Any]) -> str:
        self.prompts.append(prompt)
        self.esquemas.append(esquema)
        if self.modo == "error":
            raise FalloDelLlm("llm falso: sin respuesta")
        if self.modo == "json_invalido":
            return '{"trial_phase": '
        if self.modo == "fuera_de_esquema":
            return json.dumps({"fase": 3, "tamano": "quinientos"})
        return json.dumps(self._propuesta_para(prompt), ensure_ascii=False)

    def _propuesta_para(self, prompt: str) -> Mapping[str, Any]:
        for marcador, propuesta in self._propuestas.items():
            if marcador in prompt:
                return propuesta
        return self.por_defecto


def nli_de_metadatos(error: Exception | None = None) -> NliFalso:
    """``entailment`` para todo par salvo el ``primary_endpoint`` inventado (``neutral``). ``error``: modo caído."""
    return NliFalso(
        error,
        resultados={verbalizar_metadato("primary_endpoint", ENDPOINT_INVENTADO): NEUTRAL},
        por_defecto=IMPLICA,
    )


def lote_sintetico(cantidad: int = 20) -> tuple[DocumentoDeSemilla, ...]:
    """Documentos de literatura sintéticos, sin metadatos estructurados, con texto inline (para la muestra, AC-5)."""
    return tuple(_documento_del_lote(i) for i in range(1, cantidad + 1))


def marcador_del_lote(indice: int) -> str:
    return f"lote sintetico {indice:02d}"


def _documento_del_lote(indice: int) -> DocumentoDeSemilla:
    clave = f"lote-{indice:02d}"
    return DocumentoDeSemilla(
        document_key=clave,
        version_group_id=clave,
        source_type="literature",
        source_name="PMC Open Access",
        external_id=f"sintetico-{clave}",
        title=f"Artículo sintético {indice:02d}",
        language="en",
        cancer_type_tags=("mama",),
        published_at=date(2024, 1, 1),
        study_design="otro",
        population="adulto",
        original_format="jats_xml",
        license="CC BY 4.0",
        license_url="https://creativecommons.org/licenses/by/4.0/",
        texto=(
            f"Synthetic note {marcador_del_lote(indice)} about a breast cancer trial in phase two. "
            "The text is fictional, public and contains no patient data, only enough words to make chunks."
        ),
    )
