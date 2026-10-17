/**
 * `npm run lint:lenguaje [-- <directorio-de-mensajes>]` (US-068 AC-5, RN-23): aplica los niveles A y B de la lista
 * de términos prohibidos, con las frases permitidas, a cada mensaje de `apps/web/messages/*.json`. Falla cerrado:
 * un directorio ausente o sin archivos es un error, nunca "0 hallazgos".
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { aplanarMensajes } from '../src/aplanar-mensajes.js';
import { checkProhibitedTerms } from '../src/check-prohibited-terms.js';
import { loadProhibitedTerms } from '../src/load-prohibited-terms.js';

const RAIZ = resolve(import.meta.dirname, '../../..');
const DIRECTORIO_POR_DEFECTO = join(RAIZ, 'apps/web/messages');

function archivosDeMensajes(directorio: string): string[] {
  if (!existsSync(directorio)) return [];
  return readdirSync(directorio)
    .filter((nombre) => nombre.endsWith('.json'))
    .sort()
    .map((nombre) => join(directorio, nombre));
}

function main(): number {
  const directorio = resolve(process.argv[2] ?? DIRECTORIO_POR_DEFECTO);
  const archivos = archivosDeMensajes(directorio);
  if (archivos.length === 0) {
    console.error(
      `lint:lenguaje — no hay archivos de mensajes en ${relative(process.cwd(), directorio) || directorio}`,
    );
    return 1;
  }

  const lista = loadProhibitedTerms();
  let mensajes = 0;
  let hallazgos = 0;
  for (const archivo of archivos) {
    const nombre = relative(process.cwd(), archivo);
    for (const { clave, texto } of aplanarMensajes(JSON.parse(readFileSync(archivo, 'utf8')))) {
      mensajes++;
      const coincidencias = checkProhibitedTerms(texto, lista, {
        niveles: ['A', 'B'],
        permitirFrases: true,
      });
      for (const { termino, id, nivel } of coincidencias) {
        hallazgos++;
        console.error(`${nombre}:${clave}: término prohibido "${termino}" (${id}, nivel ${nivel})`);
      }
    }
  }
  console.log(
    `lint:lenguaje — ${hallazgos} hallazgos en ${mensajes} mensajes de ${archivos.length} archivos`,
  );
  return hallazgos === 0 ? 0 : 1;
}

process.exitCode = main();
