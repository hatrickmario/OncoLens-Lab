import { z } from 'zod';
import type { Consultador } from '../auth/auth.repository.js';
import { crearProveedorDeCatalogo } from '../evidence-analysis/catalog-version.provider.js';
import { createCompletenessRepository } from './completeness.repository.js';
import { createCompletenessService } from './completeness.service.js';
import type {
  CatalogoDeDatosCriticos,
  CompletenessService,
  DatosCriticosDeUnTipo,
} from './ports.js';

export interface DependenciasDelModulo {
  readonly db: Consultador;
  /** Directorio montado como `CLINICAL_CATALOG_PATH`. */
  readonly rutaDelCatalogo: string;
  readonly leerArchivo: (ruta: string) => string;
}

/** Forma de `datos-criticos.json` que consume el cálculo; el arranque ya la validó entera (L1D-93, RN-29). */
const esquemaDeDatosCriticos = z.object({
  verifiedReviewStatuses: z.array(z.string()).min(1),
  items: z.array(
    z.object({
      key: z.string(),
      cancerType: z.string(),
      destination: z.object({
        entity: z.string(),
        field: z.string().optional(),
        match: z.record(z.string(), z.string()).optional(),
      }),
      condition: z
        .object({
          item: z.string(),
          operator: z.enum(['igualdad', 'pertenencia', 'prefijo']),
          values: z.array(z.string()),
        })
        .optional(),
      whenConditionUnknown: z.enum(['faltante', 'no_aplica']).optional(),
      minValues: z.number().int().min(1),
    }),
  ),
});

/** Lee una vez, del catálogo montado, los datos críticos de cada tipo del manifiesto (RN-22: nada vive en el código). */
export function cargarCatalogoDeDatosCriticos(
  rutaDelCatalogo: string,
  leerArchivo: (ruta: string) => string,
): CatalogoDeDatosCriticos {
  const manifiesto = crearProveedorDeCatalogo(rutaDelCatalogo, leerArchivo);
  const porTipo = new Map<string, DatosCriticosDeUnTipo>();
  for (const tipo of manifiesto.cancerTypes()) {
    const archivo = esquemaDeDatosCriticos.parse(
      JSON.parse(leerArchivo(`${rutaDelCatalogo}/${tipo}/datos-criticos.json`)),
    );
    porTipo.set(tipo, archivo);
  }
  return { version: manifiesto.version, deTipo: (tipo) => porTipo.get(tipo) };
}

export function componerCompletitud(dependencias: DependenciasDelModulo): CompletenessService {
  return createCompletenessService({
    registros: createCompletenessRepository(dependencias.db),
    catalogo: cargarCatalogoDeDatosCriticos(dependencias.rutaDelCatalogo, dependencias.leerArchivo),
  });
}
