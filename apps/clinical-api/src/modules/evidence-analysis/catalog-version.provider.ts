import { z } from 'zod';
import { ConfiguracionInvalidaError } from '../../config/index.js';
import type { CatalogVersionProvider } from './ports.js';

const esquemaDeManifest = z.object({ version: z.string().min(1) });

/**
 * Lee UNA vez la `version` de `manifest.json` (lo crea L1D-169; este módulo solo lo lee) en el directorio montado
 * como `CLINICAL_CATALOG_PATH`. Sin manifiesto legible `clinical-api` no arranca; el error nombra la variable y
 * nunca la ruta ni el contenido (RN-10, RN-14). El `409` por versión distinta llega con US-041 (S2).
 */
export function crearProveedorDeVersionDeCatalogo(
  rutaDelCatalogo: string,
  leerArchivo: (ruta: string) => string,
): CatalogVersionProvider {
  let version: string;
  try {
    version = esquemaDeManifest.parse(
      JSON.parse(leerArchivo(`${rutaDelCatalogo}/manifest.json`)),
    ).version;
  } catch {
    throw new ConfiguracionInvalidaError(
      'CLINICAL_CATALOG_PATH',
      'no contiene un manifest.json legible con version',
    );
  }
  return { version: () => version };
}
