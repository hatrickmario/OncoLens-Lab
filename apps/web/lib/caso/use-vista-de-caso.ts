'use client';

import { useLecturaDeBff } from '../sesion/use-lectura-de-bff';
import { leerVistaDeCaso } from './leer-vista-de-caso';

/**
 * Vista de caso del paciente: se lee al montar y de nuevo con `recargar()` (el «Reintentar» y, después, los diálogos de
 * registro, `l1d-80`/`l1d-96`). `null` mientras no hay primera lectura. Una sesión vencida lleva al login con aviso.
 */
export function useVistaDeCaso(patientId: string) {
  return useLecturaDeBff(leerVistaDeCaso, patientId);
}
