import type { RagQueryInternalResponse } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { zRagQueryInternalResponseRefinado } from '../../../../../packages/api-contracts/src/zod/rag-orchestrator/refinamientos.gen.js';
import type { AlcanceDelCorpus } from '../../config/index.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { AnalisisRepository } from './evidence-analysis.repository.js';
import { construirBaseTipoNoHabilitado } from './analysis-basis.js';
import {
  armarRegistro,
  armarRegistroTipoNoHabilitado,
  type RegistroDeAnalisis,
} from './analysis-record.js';
import { aEvidenceAnalysis } from './evidence-analysis.mapper.js';
import type { AnalysisBasisBuilder, AnalysisCompletion, ResultadoDelAnalisis } from './ports.js';
import { RESPUESTA_INTERNA_INVALIDA, mapearFalloRag } from './rag-failure.js';

/** La respuesta de rag-orchestrator no cumple el contrato (o es incoherente): no se persiste ni se muestra. */
export class RespuestaInternaInvalidaError extends Error {
  constructor() {
    super('La respuesta interna no cumple el contrato');
    this.name = 'RespuestaInternaInvalidaError';
  }
}

/**
 * Defensa en el borde con el Zod generado y refinado de `RagQueryInternalResponse` (incluye el if/then de RN-02: `sin_evidencia`
 * exige puntaje null y ninguna opción); el error no hace eco del contenido.
 */
export function validarRespuestaInterna(cuerpo: unknown): RagQueryInternalResponse {
  const resultado = zRagQueryInternalResponseRefinado.safeParse(cuerpo);
  if (!resultado.success) throw new RespuestaInternaInvalidaError();
  return resultado.data;
}

/**
 * `top_relevance_score` a persistir (RN-02, RN-03): el que calculó Backend 2, copiado tal cual. Rechaza una respuesta
 * incoherente: `sin_evidencia` con puntaje u opciones, o `con_evidencia` sin puntaje. `null` nunca se vuelve `0`.
 */
export function topRelevanceScorePersistible(respuesta: RagQueryInternalResponse): number | null {
  const sinEvidencia = respuesta.status === 'sin_evidencia';
  const puntajeCoherente = sinEvidencia
    ? respuesta.topRelevanceScore === null
    : respuesta.topRelevanceScore !== null;
  if (!puntajeCoherente || (sinEvidencia && respuesta.evidenceOptions.length > 0)) {
    throw new RespuestaInternaInvalidaError();
  }
  return respuesta.topRelevanceScore;
}

/** La escritura del `AIAnalysisRecord` falló: no se muestra ningún resultado (RN-06). Sin el mensaje de PostgreSQL. */
export class FalloDePersistenciaError extends Error {
  constructor() {
    super('No se pudo persistir el análisis');
    this.name = 'FalloDePersistenciaError';
  }
}

export interface DependenciasDelCierre {
  analisis: AnalisisRepository;
  base: AnalysisBasisBuilder;
  reloj: Clock;
  /** Identificadores del `AIAnalysisRecord` (UUID); distintos del generador de `traceId`. */
  idsDeAnalisis: GeneradorDeIds;
  /** `AI_DISCLAIMER_TEXT` (literal de US-069). */
  disclaimer: string;
  /** `CORPUS_EXCLUDED_SOURCES` y `CORPUS_CUTOFF_DATE`: lo que la Base de un `tipo_no_habilitado` dice del corpus. */
  alcanceDelCorpus: AlcanceDelCorpus;
}

interface RespuestaInterpretada {
  respuesta: RagQueryInternalResponse;
  topRelevanceScore: number | null;
}

/** La respuesta interna validada con su puntaje persistible, o `null` si no cumple el contrato o es incoherente. */
function interpretarRespuestaInterna(cuerpo: unknown): RespuestaInterpretada | null {
  try {
    const respuesta = validarRespuestaInterna(cuerpo);
    return { respuesta, topRelevanceScore: topRelevanceScorePersistible(respuesta) };
  } catch (error) {
    if (error instanceof RespuestaInternaInvalidaError) return null;
    throw error;
  }
}

/**
 * RN-06: el registro se persiste ANTES de responder y la respuesta sale de la fila leída, nunca de lo armado en memoria.
 * Resuelve solo cuando la escritura terminó; cualquier fallo de la base se convierte en `FalloDePersistenciaError`, sin
 * sus detalles.
 */
async function persistirAnalisisAntesDeResponder(
  analisis: AnalisisRepository,
  registro: RegistroDeAnalisis,
  disclaimer: string,
): Promise<ResultadoDelAnalisis> {
  let persistido: RegistroDeAnalisis;
  try {
    persistido = await analisis.persistirAnalisis(registro);
  } catch {
    throw new FalloDePersistenciaError();
  }
  return { tipo: 'completado', cuerpo: aEvidenceAnalysis(persistido, disclaimer) };
}

type EntradaDeCierre = Parameters<AnalysisCompletion['completar']>[0];
type EntradaTipoNoHabilitado = Parameters<AnalysisCompletion['completarTipoNoHabilitado']>[0];

async function completarConRespuestaInterna(
  dependencias: DependenciasDelCierre,
  entrada: EntradaDeCierre,
): Promise<ResultadoDelAnalisis> {
  const { analisis, base, reloj, idsDeAnalisis, disclaimer } = dependencias;
  if (!entrada.respuesta.ok) return { tipo: 'fallo', respuesta: mapearFalloRag(entrada.respuesta) };
  const interpretada = interpretarRespuestaInterna(entrada.respuesta.cuerpo);
  if (interpretada === null) return { tipo: 'fallo', respuesta: RESPUESTA_INTERNA_INVALIDA };
  const { respuesta, topRelevanceScore } = interpretada;
  if (entrada.episodeId === null) throw new FalloDePersistenciaError();
  const registro = armarRegistro({
    id: idsDeAnalisis(),
    creadoEn: reloj.now(),
    traceId: entrada.traceId,
    patientId: entrada.patientId,
    episodeId: entrada.episodeId,
    userId: entrada.userId,
    questionTemplateId: entrada.questionTemplateId,
    continueWithWarning: entrada.continueWithWarning,
    request: entrada.request,
    dataRefs: entrada.dataRefs,
    respuesta,
    base: base.construir(entrada.request, respuesta, entrada.continueWithWarning),
    topRelevanceScore,
  });
  return persistirAnalisisAntesDeResponder(analisis, registro, disclaimer);
}

async function completarSinCorpusHabilitado(
  dependencias: DependenciasDelCierre,
  entrada: EntradaTipoNoHabilitado,
): Promise<ResultadoDelAnalisis> {
  const { analisis, reloj, idsDeAnalisis, disclaimer, alcanceDelCorpus } = dependencias;
  if (entrada.episodeId === null) throw new FalloDePersistenciaError();
  const registro = armarRegistroTipoNoHabilitado({
    id: idsDeAnalisis(),
    creadoEn: reloj.now(),
    traceId: entrada.traceId,
    patientId: entrada.patientId,
    episodeId: entrada.episodeId,
    userId: entrada.userId,
    questionTemplateId: entrada.questionTemplateId,
    continueWithWarning: entrada.continueWithWarning,
    query: entrada.query,
    sourcesSelected: entrada.sourcesSelected,
    filtersApplied: entrada.filtersApplied,
    dataClassification: entrada.dataClassification,
    catalogVersion: entrada.catalogVersion,
    contextoVacio: entrada.contextoVacio,
    base: construirBaseTipoNoHabilitado({
      sourcesSelected: entrada.sourcesSelected,
      filters: entrada.filtersApplied,
      continuedWithWarning: entrada.continueWithWarning,
      sourcesNotIncluded: alcanceDelCorpus.corpusExcludedSources,
      corpusCutoffDate: alcanceDelCorpus.corpusCutoffDate,
    }),
  });
  return persistirAnalisisAntesDeResponder(analisis, registro, disclaimer);
}

/**
 * Cierre del análisis (RN-06): valida la respuesta interna, persiste el `AIAnalysisRecord` y solo entonces
 * responde desde lo persistido.
 */
export function crearAnalysisCompletion(dependencias: DependenciasDelCierre): AnalysisCompletion {
  return {
    completar: (entrada) => completarConRespuestaInterna(dependencias, entrada),
    completarTipoNoHabilitado: (entrada) => completarSinCorpusHabilitado(dependencias, entrada),
  };
}
