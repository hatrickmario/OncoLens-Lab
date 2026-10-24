#!/usr/bin/env node
/**
 * `npm run catalog:validate [-- --dir <ruta>]` (L1D-93, RN-29): valida un directorio de catálogo contra los esquemas de
 * `packages/clinical-catalogs/schemas/` y las reglas con nombre del validador. Código 0 e informa `catalogVersion`;
 * código 1 con una línea `<codigo> <tipo>/<clave>` por incumplimiento (nunca la ruta ni valores del catálogo).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ArchivoIlegibleError,
  leerCatalogo,
  leerEsquemas,
  mensajeDe,
  validarCatalogo,
} from '../../packages/clinical-catalogs/validator/index.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const CATALOGO_POR_DEFECTO = path.join(RAIZ, 'packages/clinical-catalogs');
const leerTexto = (ruta) => readFileSync(ruta, 'utf8');

function directorioDeLosArgumentos(argumentos) {
  const indice = argumentos.indexOf('--dir');
  return indice === -1 ? CATALOGO_POR_DEFECTO : path.resolve(argumentos[indice + 1] ?? '');
}

/** Valida `directorio`; devuelve el código de salida y las líneas a imprimir. */
export function validarDirectorio(directorio) {
  try {
    const resultado = validarCatalogo({
      archivos: leerCatalogo(directorio, leerTexto),
      allowlist: JSON.parse(leerTexto(path.join(CATALOGO_POR_DEFECTO, 'validator/modelo.allowlist.json'))),
      esquemas: leerEsquemas(path.join(CATALOGO_POR_DEFECTO, 'schemas'), leerTexto),
    });
    if (resultado.valido) return { codigo: 0, lineas: [`catalog:validate OK catalogVersion=${resultado.catalogVersion}`] };
    return { codigo: 1, lineas: resultado.violaciones.map(mensajeDe) };
  } catch (error) {
    if (error instanceof ArchivoIlegibleError) return { codigo: 1, lineas: [error.message] };
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { codigo, lineas } = validarDirectorio(directorioDeLosArgumentos(process.argv.slice(2)));
  for (const linea of lineas) (codigo === 0 ? console.log : console.error)(linea);
  process.exitCode = codigo;
}
