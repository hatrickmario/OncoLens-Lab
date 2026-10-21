import { z } from 'zod';
import { ConfiguracionInvalidaError } from '../../config/index.js';
import type { CatalogVersionProvider } from './ports.js';

const esquemaDeManifest = z.object({
  version: z.string().min(1),
  // Ausente = ningún tipo en el catálogo: `validarTiposHabilitados` rechaza cualquier habilitado (US-043 AC-5).
  cancerTypes: z.array(z.string()).default([]),
});

/** Lo que el arranque lee del `manifest.json`: la versión (todo despliegue) y los tipos de cáncer del catálogo. */
export interface ProveedorDeCatalogo extends CatalogVersionProvider {
  cancerTypes(): readonly string[];
}

/**
 * Lee UNA vez la `version` y los `cancerTypes` de `manifest.json` (lo crea L1D-169; este módulo solo lo lee) en el directorio montado
 * como `CLINICAL_CATALOG_PATH`. Sin manifiesto legible `clinical-api` no arranca; el error nombra la variable y
 * nunca la ruta ni el contenido (RN-10, RN-14). La expectativa `CLINICAL_CATALOG_VERSION`, si existe, debe
 * coincidir con esa versión (US-041 D1); el `409` por versión distinta entre backends lo traduce `mapearFalloRag()`.
 */
export function crearProveedorDeVersionDeCatalogo(
  rutaDelCatalogo: string,
  leerArchivo: (ruta: string) => string,
  versionEsperada?: string,
): ProveedorDeCatalogo {
  let version: string;
  let cancerTypes: readonly string[];
  try {
    ({ version, cancerTypes } = esquemaDeManifest.parse(
      JSON.parse(leerArchivo(`${rutaDelCatalogo}/manifest.json`)),
    ));
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
  return { version: () => version, cancerTypes: () => cancerTypes };
}
