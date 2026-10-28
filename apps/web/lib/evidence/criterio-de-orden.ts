import type {
  EvidenceAnalysis,
  EvidenceOption,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { tieneAplicabilidadCalculada } from './aplicabilidad-calculada';

export const CLAVE_CRITERIO_RELEVANCIA = 'evidence.orderCriterion.relevance';
export const CLAVE_CRITERIO_APLICABILIDAD = 'evidence.orderCriterion.applicability';
export const CLAVE_BASE_APLICABILIDAD = 'evidence.relevance.basis';
export const CLAVE_BASE_RELEVANCIA = 'evidence.relevance.basisRelevancia';

/**
 * Criterio de orden visible (RN-28), elegido por la respuesta: el de aplicabilidad solo cuando **toda** opción
 * trae aplicabilidad calculada; sin ella se conserva el criterio neutro del S1 (regla de respaldo de US-125).
 * El panel nunca afirma un orden que la respuesta no construyó.
 */
export function elegirCriterioDeOrden(analisis: Pick<EvidenceAnalysis, 'evidenceOptions'>): string {
  const opciones = analisis.evidenceOptions;
  return opciones.length > 0 && opciones.every(tieneAplicabilidadCalculada)
    ? CLAVE_CRITERIO_APLICABILIDAD
    : CLAVE_CRITERIO_RELEVANCIA;
}

/** Texto de la base de la relevancia (RN-03): dice que solo desempata únicamente si el orden fue por aplicabilidad. */
export function elegirBaseDeRelevancia(opcion: Pick<EvidenceOption, 'perSource'>): string {
  return tieneAplicabilidadCalculada(opcion) ? CLAVE_BASE_APLICABILIDAD : CLAVE_BASE_RELEVANCIA;
}
