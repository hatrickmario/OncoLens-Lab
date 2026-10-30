"""Paso de metadatos de la ingesta del corpus (US-118, FR-19, RN-25): fuente estructurada primero, extracción después.

Implementa el puerto ``ResolutorDeMetadatos`` de la ingesta. Solo depende de puertos (``LlmClient``, ``NliClassifier``);
nunca de ``httpx``, ``onnxruntime`` ni SQLAlchemy. La extracción pide al LLM local un JSON por esquema, verbaliza cada
valor de forma determinista (ADR-34) y lo contrasta con los chunks del propio documento: lo que el NLI no confirma
(``NLI_ENTAILMENT_THRESHOLD``) se descarta campo a campo (RN-25).
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence

from app.application.corpus_metadata.esquema import (
    SalidaInvalida,
    construir_prompt,
    esquema_de_metadatos,
    parsear_propuesta,
)
from app.application.ports import FalloDeInferencia, FalloDelLlm, LlmClient, NliClassifier
from app.domain.corpus_metadata.campos import CAMPOS_ESCALARES
from app.domain.corpus_metadata.extraccion import (
    escalares_a_extraer,
    integrar_metadatos_verificados,
    resolver_como_pendiente,
)
from app.domain.corpus_metadata.origen import (
    OrigenDeMetadatos,
    metadatos_de_la_fuente,
    origen_de_metadatos,
)
from app.domain.corpus_metadata.resultado import (
    CampoDeMetadato,
    FalloDeMetadatos,
    MetadatosResueltos,
)
from app.domain.corpus_metadata.verbalizacion import verbalizar_metadato
from app.domain.corpus_metadata.verificacion import metadato_verificado
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.poblacion import CRITERIOS_DE_POBLACION
from app.domain.nli import ParNli

# Los únicos fallos que no impiden indexar (D4): el LLM, el NLI o una salida fuera del esquema. Cualquier otro error es
# un defecto y sube; ``KeyboardInterrupt`` nunca se captura.
FALLOS_QUE_DEJAN_PENDIENTE = (FalloDelLlm, FalloDeInferencia, SalidaInvalida)


class MetadataExtractionService:
    def __init__(
        self,
        *,
        llm: LlmClient,
        nli: NliClassifier,
        umbral_nli: float,
        incluir_poblacion: bool = True,
    ) -> None:
        self._incluir_poblacion = incluir_poblacion
        self._llm = llm
        self._nli = nli
        self._umbral_nli = umbral_nli

    def resolver(
        self, documento: DocumentoDeSemilla, texto: str, fragmentos: Sequence[str]
    ) -> MetadatosResueltos:
        if origen_de_metadatos(documento) is OrigenDeMetadatos.FUENTE_ESTRUCTURADA:
            return metadatos_de_la_fuente(documento)
        try:
            return self._extraer_y_verificar(documento, texto, fragmentos)
        except FALLOS_QUE_DEJAN_PENDIENTE as fallo:
            # Solo la clase del error: su mensaje podría llevar texto del documento (RN-10).
            return resolver_como_pendiente(documento, FalloDeMetadatos(type(fallo).__name__))

    def _extraer_y_verificar(
        self, documento: DocumentoDeSemilla, texto: str, fragmentos: Sequence[str]
    ) -> MetadatosResueltos:
        propuestos = self._proponer(documento, texto)
        verificados = self._verificar(propuestos, fragmentos)
        return integrar_metadatos_verificados(documento, verificados)

    def _proponer(self, documento: DocumentoDeSemilla, texto: str) -> tuple[CampoDeMetadato, ...]:
        """El LLM propone solo lo que el manifiesto no declara; la salida se valida contra el esquema cerrado."""
        solicitados = escalares_a_extraer(documento)
        prompt = construir_prompt(documento.title, texto, (*solicitados, *CRITERIOS_DE_POBLACION))
        crudo = asyncio.run(self._llm.completar_json(prompt, esquema_de_metadatos()))
        propuesta = parsear_propuesta(crudo)
        return tuple(
            c
            for c in propuesta.campos()
            if c.campo not in CAMPOS_ESCALARES or c.campo in solicitados
        )

    def _verificar(
        self, propuestos: Sequence[CampoDeMetadato], fragmentos: Sequence[str]
    ) -> tuple[CampoDeMetadato, ...]:
        """Un par (chunk, hipótesis) por chunk y campo, en una sola llamada al NLI; se conserva por campo."""
        pares = [
            ParNli(fragmento, verbalizar_metadato(c.campo, c.valor))
            for c in propuestos
            for fragmento in fragmentos
        ]
        resultados = self._nli.clasificar(pares)
        por_campo = len(fragmentos)
        return tuple(
            c
            for indice, c in enumerate(propuestos)
            if metadato_verificado(
                resultados[indice * por_campo : (indice + 1) * por_campo], self._umbral_nli
            )
        )
