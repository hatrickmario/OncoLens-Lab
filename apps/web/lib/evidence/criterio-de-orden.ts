import type { EvidenceAnalysis } from '../../../../packages/api-contracts/src/types/clinical-api';

export const CLAVE_CRITERIO_RELEVANCIA = 'evidence.orderCriterion.relevance';

/**
 * Criterio de orden visible (RN-28). Heurística provisional del S1: el panel nunca afirma un orden por
 * aplicabilidad que no construye, ni siquiera con `applicability` no vacío; US-126 AC-7 la sustituye por
 * un campo del contrato.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- la firma ya recibe la respuesta que US-126 AC-7 usará
export function elegirCriterioDeOrden(_analisis: Pick<EvidenceAnalysis, 'applicability'>): string {
  return CLAVE_CRITERIO_RELEVANCIA;
}
