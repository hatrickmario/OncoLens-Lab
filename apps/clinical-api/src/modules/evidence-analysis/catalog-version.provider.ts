import { z } from 'zod';
import { ConfiguracionInvalidaError } from '../../config/index.js';
import type { CatalogVersionProvider } from './ports.js';

const esquemaDeManifest = z.object({ version: z.string().min(1) });

/**
 * Lee UNA vez la `version` de `manifest.json` (lo crea L1D-169; este módulo solo lo lee) en el directorio montado
 * como `CLINICAL_CATALOG_PATH`. Sin manifiesto legible `clinical-api` no arranca; el error nombra la variable y
 * nunca la ruta ni el contenido (RN-10, RN-14). La expectativa `CLINICAL_CATALOG_VERSION`, si existe, debe
 * coincidir con esa versión (US-041 D1); el `409` por versión distinta entre backends lo traduce `mapearFalloRag()`.
 */
export function crearProveedorDeVersionDeCatalogo(
  rutaDelCatalogo: string,
  leerArchivo: (ruta: string) => string,
  versionEsperada?: string,
): CatalogVersionProvider {
  let version: string;
  try {
    version = esquemaDeManifest.parse(
      JSON.parse(leerArchivo(`${rutaDelCatalogo}/manifest.json`)),
    ).version;
  } catch {
    throw new ConfiguracionInvalidaError('CLINICAL_CATALOG_PATH', 'manifest.json legible', {
      motivo: 'catalogo_no_disponible',
    });
  }
  if (versionEsperada !== undefined && versionEsperada !== version) {
    throw new ConfiguracionInvalidaError(
      'CLINICAL_CATALOG_VERSION',
      'debe coincidir con la versión del manifest.json montado',
      { motivo: 'version_catalogo_distinta' },
    );
  }
  return { version: () => version };
}
