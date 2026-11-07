"""Nodo ``fuentes_limitaciones`` del grafo del chat (US-266, ADR-51, RN-04, RN-25): determinista, sin LLM, sin NLI.

Sustituye el esqueleto de la intención ``fuentes_limitaciones`` (se inyecta en ``construir_grafo(capacidades=...)``). Responde
solo con lo que el hilo ya sabe del último turno de evidencia (``ultimaEvidencia`` y ``citasMostradas`` del estado) y con lo
que el corpus declara: los metadatos de cada documento citado SE RELEEN del catálogo en este turno (nunca del estado ni de
un texto generado), la release vigente da la fecha de corte y las fuentes no incluidas. Etapas, una por método: resolver los
documentos citados → armar los bloques ``fuente`` → armar las limitaciones de la recuperación y de la evidencia.

Los bloques ``fuente`` y ``limitacion`` son deterministas y están exentos de cita (glosario S6 §3): no llevan ``chunkId`` ni
``citations``, así que nada de lo que dicen cuenta como soporte de otra afirmación (RN-24). Un fallo del catálogo, de las
posiciones o de la release falla cerrado (``RETRIEVAL_UNAVAILABLE``), sin respuesta parcial. Logs: conteos y ``traceId``,
jamás los metadatos listados.
"""

from __future__ import annotations

import logging
from typing import Any

from app.application.bordes import invocar_borde_fallando_cerrado
from app.application.chat.grafo import EstadoDelGrafo
from app.application.ports import CorpusCatalogReader, CorpusReleaseReader, PosicionDeChunks
from app.domain.chat.estado import EstadoDelHilo, UltimaEvidencia
from app.domain.chat.fuentes_limitaciones import (
    MENSAJE_SIN_CONSULTA,
    MENSAJE_SIN_FUENTES_CITADAS,
    chunks_citados,
    texto_de_la_fuente,
    texto_de_limitaciones_de_la_evidencia,
    texto_de_limitaciones_de_la_recuperacion,
)
from app.domain.chat.turno import BloqueDelTurno, TipoDeBloque

logger = logging.getLogger(__name__)


class NodoFuentesLimitaciones:
    def __init__(
        self,
        *,
        posiciones: PosicionDeChunks,
        catalogo: CorpusCatalogReader,
        lector_release: CorpusReleaseReader,
    ) -> None:
        self._posiciones = posiciones
        self._catalogo = catalogo
        self._lector_release = lector_release

    async def ejecutar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        hilo = estado.get("hilo") or EstadoDelHilo()
        ultima = hilo.estructurado.ultima_evidencia
        if ultima is None:
            logger.info("event=chat_fuentes traceId=%s evidencia_previa=no", estado["trace_id"])
            return self._entrega((BloqueDelTurno(TipoDeBloque.limitacion, MENSAJE_SIN_CONSULTA),))
        trace_id = estado["trace_id"]
        textos_de_fuentes = await self._textos_de_las_fuentes(
            trace_id, chunks_citados(ultima, hilo.estructurado.citas_mostradas)
        )
        limitaciones = await self._limitaciones(trace_id, hilo, ultima, bool(textos_de_fuentes))
        logger.info(
            "event=chat_fuentes traceId=%s evidencia_previa=si fuentes=%d bloques_de_limitacion=%d",
            trace_id,
            len(textos_de_fuentes),
            len(limitaciones),
        )
        return self._entrega(
            (
                *(BloqueDelTurno(TipoDeBloque.fuente, t) for t in textos_de_fuentes),
                *limitaciones,
            )
        )

    @staticmethod
    def _entrega(bloques: tuple[BloqueDelTurno, ...]) -> dict[str, Any]:
        return {"propuestas": (), "bloques_deterministas": bloques}

    async def _textos_de_las_fuentes(
        self, trace_id: str, chunk_ids: tuple[str, ...]
    ) -> tuple[str, ...]:
        """Un texto por documento citado, en el orden del *reranker*; los metadatos salen del catálogo (RN-04, RN-25)."""
        if not chunk_ids:
            return ()
        posiciones = await invocar_borde_fallando_cerrado(
            trace_id, "posiciones", self._posiciones.posiciones, set(chunk_ids)
        )
        documentos = tuple(
            dict.fromkeys(posiciones[c].document_id for c in chunk_ids if c in posiciones)
        )
        if len(posiciones) < len(chunk_ids):
            logger.info(
                "event=chat_fuentes_chunks_no_vigentes traceId=%s cantidad=%d",
                trace_id,
                len(chunk_ids) - len(posiciones),
            )
        if not documentos:
            return ()
        fichas = await invocar_borde_fallando_cerrado(
            trace_id, "catalogo", self._catalogo.fichas_por_documento, set(documentos)
        )
        return tuple(texto_de_la_fuente(fichas.get(d)) for d in documentos)

    async def _limitaciones(
        self, trace_id: str, hilo: EstadoDelHilo, ultima: UltimaEvidencia, hay_fuentes: bool
    ) -> tuple[BloqueDelTurno, ...]:
        release = await invocar_borde_fallando_cerrado(
            trace_id, "release", self._lector_release.release_vigente
        )
        recuperacion = texto_de_limitaciones_de_la_recuperacion(
            release.cutoff_date, release.excluded_sources, len(ultima.chunk_ids)
        )
        textos = (
            *(() if hay_fuentes else (MENSAJE_SIN_FUENTES_CITADAS,)),
            recuperacion,
            texto_de_limitaciones_de_la_evidencia(hilo.limitaciones_del_analisis),
        )
        return tuple(BloqueDelTurno(TipoDeBloque.limitacion, t) for t in textos)
