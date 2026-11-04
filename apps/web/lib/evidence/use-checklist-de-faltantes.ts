'use client';

import { useLecturaDeBff } from '../sesion/use-lectura-de-bff';
import { leerChecklist } from './leer-checklist';

/**
 * Checklist de datos críticos del paciente: se lee al montar y de nuevo cuando el panel o la vista de caso lo piden
 * (`releer`, antes de cada análisis, FR-23, y tras un registro manual). `null` mientras no hay primera lectura. El aviso
 * es informativo; el servidor recalcula (D1). Una sesión vencida lleva al login con el aviso de sesión expirada.
 */
export function useChecklistDeFaltantes(patientId: string) {
  const { lectura, recargar } = useLecturaDeBff(leerChecklist, patientId);
  return { lectura, releer: recargar };
}
