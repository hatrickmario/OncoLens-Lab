import type { Consultador } from '../auth/auth.repository.js';
import type { RepositorioDeLaVistaDeCaso } from './ports.js';

export function createCaseViewRepository(_db: Consultador): RepositorioDeLaVistaDeCaso {
  return {
    existePaciente: () => Promise.reject(new Error('no implementado')),
    leerDatosDelCaso: () => Promise.reject(new Error('no implementado')),
  };
}
