import type { Consultador } from '../auth/auth.repository.js';
import type { CompletenessService } from './ports.js';

export interface DependenciasDelModulo {
  readonly db: Consultador;
  /** Directorio montado como `CLINICAL_CATALOG_PATH`. */
  readonly rutaDelCatalogo: string;
  readonly leerArchivo: (ruta: string) => string;
}

export function componerCompletitud(_dependencias: DependenciasDelModulo): CompletenessService {
  throw new Error('no implementado');
}
