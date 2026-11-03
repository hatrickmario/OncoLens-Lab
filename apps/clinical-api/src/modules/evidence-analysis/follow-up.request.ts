import type {
  ClinicalContext,
  PriorAnalysisMemory,
  RagFollowUpRequest,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { RegistroDeAnalisis } from './analysis-record.js';
import type { FilaDeEvento } from './evidence-analysis.repository.js';
import type { ContextoPermitido } from './ports.js';

/** Memoria rotulada y no citable del análisis de origen (RN-24), con fechas relativas respecto de `ahora`. */
export function memoriaDelAnalisis(
  registro: RegistroDeAnalisis,
  eventosPosteriores: readonly FilaDeEvento[],
  ahora: Date,
): PriorAnalysisMemory {
  void registro;
  void eventosPosteriores;
  void ahora;
  throw new Error('no implementado');
}

/**
 * Contexto que se entrega al desidentificador (RN-11): el snapshot del análisis con la memoria dentro de
 * `priorAnalyses`, para que el mismo enmascarado de ADR-40 cubra el texto de la memoria y de la evolución.
 */
export function contextoConMemoria(
  registro: RegistroDeAnalisis,
  memoria: PriorAnalysisMemory,
): ContextoPermitido {
  void registro;
  void memoria;
  throw new Error('no implementado');
}

export interface EntradaDelRequestDeSeguimiento {
  traceId: string;
  catalogVersion: string;
  /** Pregunta ya normalizada y enmascarada. */
  question: string;
  registro: RegistroDeAnalisis;
  /** Salida del desidentificador: seudónimo nuevo y memoria enmascarada en `priorAnalyses`. */
  clinicalContext: ClinicalContext;
}

/** `RagFollowUpRequest`: la memoria sale de `priorAnalyses` a `analysisMemory`; filtros y clasificación son los del análisis. */
export function armarRagFollowUpRequest(
  entrada: EntradaDelRequestDeSeguimiento,
): RagFollowUpRequest {
  void entrada;
  throw new Error('no implementado');
}
