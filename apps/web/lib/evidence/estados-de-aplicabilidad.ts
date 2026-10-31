import type {
  ApplicabilityCriterion,
  ApplicabilitySummary,
} from '../../../../packages/api-contracts/src/types/clinical-api';

/**
 * Los cuatro estados con su símbolo: el estado se distingue por texto, nunca solo por color (NFR-12, WCAG 1.4.1).
 * Fuente única del símbolo y de la clave de literal/clase (`evidence.aplicabilidad.<clave>`), compartida por la
 * línea de conteos y la fila de la tabla.
 */
export const ESTADOS_DE_APLICABILIDAD = [
  { estado: 'coincide', clave: 'coincide', simbolo: '✓' },
  { estado: 'parcial', clave: 'parcial', simbolo: '◐' },
  { estado: 'no_coincide', clave: 'noCoincide', simbolo: '✕' },
  { estado: 'desconocido', clave: 'desconocido', simbolo: '?' },
] as const satisfies readonly {
  estado: ApplicabilityCriterion['status'];
  clave: keyof ApplicabilitySummary;
  simbolo: string;
}[];

/** Datos de presentación de un estado de criterio. */
export function presentacionDelEstado(estado: ApplicabilityCriterion['status']) {
  return ESTADOS_DE_APLICABILIDAD.find((e) => e.estado === estado)!;
}
