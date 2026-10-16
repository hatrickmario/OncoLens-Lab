#!/usr/bin/env node
/**
 * AC-5 de US-036: todo archivo de datos bajo las raíces de `config/dataset-roots.json` declara la clase de datos
 * `sintetico` en su manifiesto más cercano o en su propia cabecera (RN-13).
 * Uso: node scripts/ci/dataset-class-check.mjs [--root <dir>] [--config <archivo>]
 */
import { pathToFileURL } from 'node:url';
import { listarArchivosVersionados, leerTexto } from './lib/archivos.mjs';
import { declaraClaseEnCabecera, declaraClaseSintetico, manifiestoMasCercano } from './lib/claseDatos.mjs';
import { leerConfiguracion, parametros } from './lib/cli.mjs';

export const MENSAJE_SIN_CLASE = 'dataset sin clase de datos `sintetico`';

const raizDe = (ruta, raices) => raices.find((raiz) => ruta.startsWith(raiz));

/**
 * Rutas de datasets sin clase `sintetico`.
 * @param {{ archivos: string[], raices: string[], leerArchivo: (ruta: string) => string | null }} entrada
 */
export function datasetsSinClase({ archivos, raices, leerArchivo }) {
  return archivos
    .filter((ruta) => raizDe(ruta, raices))
    .filter((ruta) => {
      const manifiesto = manifiestoMasCercano(ruta, leerArchivo, raizDe(ruta, raices));
      // El manifiesto más cercano manda: si declara otra clase, la cabecera del archivo no la corrige.
      if (manifiesto) return !declaraClaseSintetico(manifiesto);
      return !declaraClaseEnCabecera(leerArchivo(ruta) ?? '');
    });
}

function main() {
  const { raiz, configuracion } = parametros(process.argv.slice(2), 'config/dataset-roots.json');
  const raices = leerConfiguracion(raiz, configuracion);
  const sinClase = datasetsSinClase({
    archivos: listarArchivosVersionados(raiz),
    raices,
    leerArchivo: (ruta) => leerTexto(raiz, ruta),
  });
  sinClase.forEach((ruta) => console.error(`${ruta}: ${MENSAJE_SIN_CLASE}`));
  if (sinClase.length === 0) console.log('dataset-class-check — todos los datasets de evaluación declaran la clase sintetico');
  return sinClase.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
