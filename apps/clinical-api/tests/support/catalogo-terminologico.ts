import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Catálogos de los tests de normalización (L1D-84): el FX-01b-b de test y el catálogo real del repo. */

const RAIZ_PAQUETE = resolve(
  fileURLToPath(new URL('../../../../packages/clinical-catalogs', import.meta.url)),
);

/** FX-01b-b: códigos LOINC/CUPS ficticios; CIE-10 y ATC reales (`L02AE02`). Solo sintético (RN-13, RN-14). */
export const RUTA_CATALOGO_FX01BB = resolve(RAIZ_PAQUETE, 'test/fixtures/test-normalizacion-1.0.0');
export const VERSION_CATALOGO_FX01BB = 'test-normalizacion-1.0.0';
/** El catálogo real montado en producción (`CLINICAL_CATALOG_PATH`). */
export const RUTA_CATALOGO_REAL = RAIZ_PAQUETE;
