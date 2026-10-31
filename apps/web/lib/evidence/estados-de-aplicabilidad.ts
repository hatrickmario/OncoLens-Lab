import type {
  ApplicabilityCriterion,
  ApplicabilitySummary,
} from '../../../../packages/api-contracts/src/types/clinical-api';

type Estado = ApplicabilityCriterion['status'];

/**
 * Símbolo y clave de literal/clase (`evidence.aplicabilidad.<clave>`) de cada estado: el estado se distingue por
 * texto, nunca solo por color (NFR-12, WCAG 1.4.1). `Record<Estado, …>` es exhaustivo: si el contrato añade un
 * estado, el compilador obliga a presentarlo. Fuente única de la línea de conteos y de la fila de la tabla.
 */
const PRESENTACION: Record<Estado, { clave: keyof ApplicabilitySummary; simbolo: string }> = {
  coincide: { clave: 'coincide', simbolo: '✓' },
  parcial: { clave: 'parcial', simbolo: '◐' },
  no_coincide: { clave: 'noCoincide', simbolo: '✕' },
  desconocido: { clave: 'desconocido', simbolo: '?' },
};

const ORDEN_DE_LECTURA: readonly Estado[] = ['coincide', 'parcial', 'no_coincide', 'desconocido'];

/** Los estados en el orden en que se leen los conteos. */
export const ESTADOS_DE_APLICABILIDAD = ORDEN_DE_LECTURA.map((estado) => ({
  estado,
  ...PRESENTACION[estado],
}));

/** Datos de presentación de un estado de criterio. */
export function presentacionDelEstado(estado: Estado) {
  return PRESENTACION[estado];
}
