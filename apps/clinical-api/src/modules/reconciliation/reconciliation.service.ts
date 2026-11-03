import type { Registrar } from '../../infrastructure/logger.js';
import type { CatalogoTerminologico, ReconciliationService } from './ports.js';

export interface DependenciasDeReconciliation {
  readonly catalogo: CatalogoTerminologico;
  readonly registrar?: Registrar;
}

export function createReconciliationService(
  _dependencias: DependenciasDeReconciliation,
): ReconciliationService {
  throw new Error('no implementado');
}
