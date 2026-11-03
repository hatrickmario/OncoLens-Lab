import { readFileSync } from 'node:fs';
import { crearCatalogoTerminologico } from '../../src/infrastructure/catalogo/catalogo-terminologico.js';
import { crearProveedorDeCatalogo } from '../../src/infrastructure/catalogo/catalog-version.provider.js';
import type { LineaDeLog } from '../../src/infrastructure/logger.js';
import { createReconciliationService } from '../../src/modules/reconciliation/reconciliation.service.js';
import type { ReconciliationService } from '../../src/modules/reconciliation/ports.js';

/** Servicio de normalización con el adaptador REAL sobre un catálogo de disco (lectura determinista, sin fakes). */

export const leerTexto = (ruta: string): string => readFileSync(ruta, 'utf8');

export interface ServicioDeTest {
  readonly servicio: ReconciliationService;
  /** Líneas de log registradas por el servicio (para comprobar que no llevan el texto clínico). */
  readonly logs: LineaDeLog[];
}

export function servicioSobreCatalogo(rutaDelCatalogo: string): ServicioDeTest {
  const logs: LineaDeLog[] = [];
  const proveedor = crearProveedorDeCatalogo(rutaDelCatalogo, leerTexto);
  const catalogo = crearCatalogoTerminologico(rutaDelCatalogo, leerTexto, proveedor);
  const servicio = createReconciliationService({
    catalogo,
    registrar: (linea) => logs.push(linea),
  });
  return { servicio, logs };
}
