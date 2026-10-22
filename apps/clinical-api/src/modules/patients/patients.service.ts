import type { PatientPage } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { FiltrosDelListado } from './patients.schema.js';

/** Vista de cada elemento según el permiso de la sesión (`x-view-by-permission`). */
export type VistaDeListado = 'doctor_listado' | 'admin';

export interface PatientsService {
  listar(entrada: { filtros: FiltrosDelListado; vista: VistaDeListado }): Promise<PatientPage>;
}

export function crearPatientsService(): PatientsService {
  return {
    listar() {
      return Promise.reject(new Error('no implementado'));
    },
  };
}
