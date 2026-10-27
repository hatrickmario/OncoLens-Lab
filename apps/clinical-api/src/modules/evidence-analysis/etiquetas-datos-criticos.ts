import { z } from 'zod';
import { crearProveedorDeCatalogo } from './catalog-version.provider.js';
import type { EtiquetaDeDatoCritico } from './ports.js';

/** Lo único que este módulo lee de `datos-criticos.json`: la clave y su `label.es` (el arranque ya validó el resto). */
const esquemaDeEtiquetas = z.object({
  items: z.array(z.object({ key: z.string(), label: z.object({ es: z.string().min(1) }) })),
});

/**
 * Etiquetas `label.es` de los datos críticos de cada tipo del manifiesto del catálogo montado (US-128, D3), leídas una
 * vez en el arranque. Texto de catálogo versionado: nunca valores ni datos del paciente (RN-10). Si una clave se repite
 * entre tipos prevalece la primera (el orden del manifiesto).
 */
export function cargarEtiquetasDeDatosCriticos(
  rutaDelCatalogo: string,
  leerArchivo: (ruta: string) => string,
): EtiquetaDeDatoCritico {
  const etiquetas = new Map<string, string>();
  for (const tipo of crearProveedorDeCatalogo(rutaDelCatalogo, leerArchivo).cancerTypes()) {
    const archivo = esquemaDeEtiquetas.parse(
      JSON.parse(leerArchivo(`${rutaDelCatalogo}/${tipo}/datos-criticos.json`)),
    );
    for (const { key, label } of archivo.items)
      if (!etiquetas.has(key)) etiquetas.set(key, label.es);
  }
  return (clave) => etiquetas.get(clave);
}
