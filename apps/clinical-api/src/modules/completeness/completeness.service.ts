import type {
  CatalogoDeDatosCriticos,
  CompletenessService,
  RegistrosDeCompletitud,
} from './ports.js';

export interface DependenciasDelServicio {
  readonly registros: RegistrosDeCompletitud;
  readonly catalogo: CatalogoDeDatosCriticos;
}

export function createCompletenessService(
  _dependencias: DependenciasDelServicio,
): CompletenessService {
  throw new Error('no implementado');
}
