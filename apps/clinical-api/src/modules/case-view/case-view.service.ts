import type { CompletenessService } from '../completeness/ports.js';
import type { CaseViewService, RepositorioDeLaVistaDeCaso } from './ports.js';

export interface DependenciasDelServicio {
  readonly repo: RepositorioDeLaVistaDeCaso;
  readonly completitud: CompletenessService;
}

export function createCaseViewService(_dependencias: DependenciasDelServicio): CaseViewService {
  return {
    obtener: () => Promise.reject(new Error('no implementado')),
  };
}
