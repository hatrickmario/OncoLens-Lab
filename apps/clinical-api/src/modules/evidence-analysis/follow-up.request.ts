import type {
  ClinicalContext,
  PriorAnalysisMemory,
  RagFollowUpRequest,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { RegistroDeAnalisis } from './analysis-record.js';
import type { FilaDeEvento } from './evidence-analysis.repository.js';
import { mesesTranscurridos } from './clinical-context.builder.js';
import type { ContextoPermitido } from './ports.js';

/** Fecha UTC `AAAA-MM-DD` de un instante: la unidad de las fechas del contexto y de la evolución posterior. */
export const fechaUtc = (instante: Date): string => instante.toISOString().slice(0, 10);

/** Texto de las afirmaciones de la síntesis (acuerdos y discrepancias): contexto del hilo, nunca una cita (RN-24). */
function resumenDeLaSintesis(sintesis: RegistroDeAnalisis['synthesis']): string {
  return [...sintesis.agreements, ...sintesis.discrepancies.map(({ claim }) => claim)]
    .map(({ text }) => text)
    .join(' ');
}

/** Memoria rotulada y no citable del análisis de origen (RN-24), con fechas relativas respecto de `ahora`. */
export function memoriaDelAnalisis(
  registro: RegistroDeAnalisis,
  eventosPosteriores: readonly FilaDeEvento[],
  ahora: Date,
): PriorAnalysisMemory {
  return {
    source: 'analisis_previo_ia',
    citable: false,
    monthsAgo: mesesTranscurridos(fechaUtc(registro.createdAt), ahora) ?? 0,
    question: registro.queryText,
    synthesisSummary: resumenDeLaSintesis(registro.synthesis),
    optionsDescribed: registro.evidenceOptions.map(({ option }) => option),
    linkedDecision: null,
    outcomesSince: eventosPosteriores.map((evento) => ({
      eventType: evento.eventType,
      monthsAgo: mesesTranscurridos(evento.eventDate, ahora) ?? 0,
      description: evento.description,
    })),
  };
}

/**
 * Contexto que se entrega al desidentificador (RN-11): el snapshot del análisis con la memoria dentro de
 * `priorAnalyses`, para que el mismo enmascarado de ADR-40 cubra el texto de la memoria y de la evolución.
 */
export function contextoConMemoria(
  registro: RegistroDeAnalisis,
  memoria: PriorAnalysisMemory,
): ContextoPermitido {
  return { ...registro.clinicalContextSnapshot, priorAnalyses: [memoria] };
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
  const { priorAnalyses, ...contexto } = entrada.clinicalContext;
  return {
    traceId: entrada.traceId,
    dataClassification: entrada.registro.dataClassification,
    catalogVersion: entrada.catalogVersion,
    question: entrada.question,
    clinicalContext: { ...contexto, priorAnalyses: [] },
    analysisMemory: priorAnalyses,
    filtersApplied: entrada.registro.filtersApplied,
  };
}
