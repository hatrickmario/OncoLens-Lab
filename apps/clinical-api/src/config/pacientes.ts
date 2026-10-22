import { readPositiveInteger } from './secciones.js';

export interface PacientesConfig {
  /** `PATIENTS_PAGE_SIZE`: pacientes por página del listado y de la búsqueda (RN-22). */
  pageSize: number;
}

const PAGE_SIZE_POR_DEFECTO = 20;

/** Listado de pacientes (US-048): el tamaño de página no es un literal del dominio (RN-22). */
export function readPacientesConfig(env: NodeJS.ProcessEnv): PacientesConfig {
  return { pageSize: readPositiveInteger(env, 'PATIENTS_PAGE_SIZE', PAGE_SIZE_POR_DEFECTO) };
}
