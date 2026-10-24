#!/usr/bin/env node
/**
 * `npm run catalog:hash -- --file <tipo>/<archivo>.json --scope datos_criticos,matriz_item_campo [--dir <ruta>]`
 * (L1D-93 D4): imprime el `catalogHash` que debe llevar el bloque `validation` de ese archivo. Lo usa quien publica una
 * versión revisada del catálogo (DEC-01); `catalog:validate` recalcula el mismo hash.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { catalogHashDe } from '../../packages/clinical-catalogs/validator/index.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');

function opcion(argumentos, nombre) {
  const indice = argumentos.indexOf(nombre);
  return indice === -1 ? undefined : argumentos[indice + 1];
}

/** Hash de los ítems de `archivo` (ruta relativa al catálogo) para los `alcances` indicados. */
export function hashDelArchivo(directorio, archivo, alcances) {
  const contenido = JSON.parse(readFileSync(path.join(directorio, archivo), 'utf8'));
  return catalogHashDe(alcances, contenido.items);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argumentos = process.argv.slice(2);
  const archivo = opcion(argumentos, '--file');
  const alcances = opcion(argumentos, '--scope')?.split(',');
  if (archivo === undefined || alcances === undefined) {
    console.error(
      'uso: catalog:hash -- --file <tipo>/<archivo>.json --scope <alcance>[,<alcance>] [--dir <ruta>]',
    );
    process.exitCode = 2;
  } else {
    const directorio = path.resolve(
      opcion(argumentos, '--dir') ?? path.join(RAIZ, 'packages/clinical-catalogs'),
    );
    console.log(hashDelArchivo(directorio, archivo, alcances));
  }
}
