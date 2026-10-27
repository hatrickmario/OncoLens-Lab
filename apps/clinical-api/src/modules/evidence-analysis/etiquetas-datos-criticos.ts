import type { EtiquetaDeDatoCritico } from './ports.js';

/** Etiquetas `label.es` de los datos críticos de cada tipo del manifiesto del catálogo montado (US-128, D3). */
export function cargarEtiquetasDeDatosCriticos(
  _rutaDelCatalogo: string,
  _leerArchivo: (ruta: string) => string,
): EtiquetaDeDatoCritico {
  throw new Error('no implementado');
}
