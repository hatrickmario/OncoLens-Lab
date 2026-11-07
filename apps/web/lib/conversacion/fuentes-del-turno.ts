import type {
  CitedSource,
  ConversationTurn,
} from '../../../../packages/api-contracts/src/types/clinical-api';

/**
 * Fuentes citadas por las opciones del análisis del turno, sin repetir una fuente que cite más de una opción. Son las
 * únicas con metadatos del corpus; un turno sin `evidenceAnalysis` no tiene referencias que listar.
 */
export function fuentesDelTurno(turno: Pick<ConversationTurn, 'evidenceAnalysis'>): CitedSource[] {
  const fuentes = (turno.evidenceAnalysis?.evidenceOptions ?? []).flatMap((o) => o.citedSources);
  return [...new Map(fuentes.map((fuente) => [fuente.chunkId, fuente])).values()];
}
