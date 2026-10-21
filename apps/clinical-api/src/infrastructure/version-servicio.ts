import { readFileSync } from 'node:fs';

/**
 * `openapi.yaml` junto a `src/` (en desarrollo con tsx) o junto a `dist/` (compilado: `dist/apps/clinical-api/src/...`
 * queda cinco niveles bajo la carpeta de la app). La imagen de Docker lo copia al lado de `dist/`.
 */
const RUTAS_DEL_SPEC = [
  new URL('../../openapi.yaml', import.meta.url),
  new URL('../../../../../openapi.yaml', import.meta.url),
];

const VERSION_DESCONOCIDA = 'desconocida';
const LINEA_DE_VERSION = /^info:\s*\n(?:[ \t]+\S.*\n)*?[ \t]+version:\s*['"]?([^\s'"]+)['"]?\s*$/m;

const leerArchivo = (ruta: URL): string => readFileSync(ruta, 'utf8');

/**
 * Versión del servicio = `info.version` de su `openapi.yaml`: una sola fuente que `/health` expone como `serviceVersion`
 * (el `version` del paquete no se sube con cada cambio de contrato). Si el spec no se puede leer, `desconocida`.
 */
export function versionDelServicio(leer: (ruta: URL) => string = leerArchivo): string {
  for (const ruta of RUTAS_DEL_SPEC) {
    try {
      const version = LINEA_DE_VERSION.exec(leer(ruta))?.[1];
      if (version !== undefined) return version;
    } catch {
      // Se prueba la siguiente ruta.
    }
  }
  return VERSION_DESCONOCIDA;
}
