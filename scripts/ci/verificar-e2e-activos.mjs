#!/usr/bin/env node
/**
 * Paso previo del job `e2e` (L1D-278, ARR-02 AC-1; CLAUDE.md, Política TDD): ningún E2E de `apps/web/e2e/` puede estar
 * desactivado ni aislado con `test.skip`, `test.only` o `test.fixme` (ni sus variantes de `describe`). Nombra cada archivo
 * y línea; sale con 1 si encuentra alguno.
 *
 *   node scripts/ci/verificar-e2e-activos.mjs [--root <dir>] [--dir <carpeta relativa>]
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parametros } from './lib/cli.mjs';

const CARPETA_POR_DEFECTO = 'apps/web/e2e';
const DESACTIVADORES = /\b(?:test|it)(?:\.describe)?(?:\.(?:serial|parallel))?\.(?:skip|only|fixme)\b/;
const ESPECIFICACION = /\.(?:spec|test)\.[cm]?[jt]sx?$/;

/** Líneas (1-based) de `texto` que desactivan o aíslan un test. */
export function lineasDesactivadas(texto) {
  return texto
    .split('\n')
    .map((linea, indice) => (DESACTIVADORES.test(linea) ? indice + 1 : 0))
    .filter(Boolean);
}

/** `{ archivo, linea }` de cada E2E desactivado bajo `carpeta` (ruta absoluta). */
export function e2eDesactivados(carpeta) {
  return readdirSync(carpeta)
    .filter((nombre) => ESPECIFICACION.test(nombre))
    .sort()
    .flatMap((nombre) =>
      lineasDesactivadas(readFileSync(path.join(carpeta, nombre), 'utf8')).map((linea) => ({ archivo: nombre, linea })),
    );
}

function main() {
  const argumentos = process.argv.slice(2);
  const { raiz } = parametros(argumentos, '');
  const indice = argumentos.indexOf('--dir');
  const carpeta = path.resolve(raiz, indice === -1 ? CARPETA_POR_DEFECTO : argumentos[indice + 1]);
  const encontrados = e2eDesactivados(carpeta);
  encontrados.forEach(({ archivo, linea }) =>
    console.error(`verificar-e2e-activos — ${archivo}:${linea} desactiva o aísla un E2E (test.skip, test.only o test.fixme)`),
  );
  if (encontrados.length === 0) console.log('verificar-e2e-activos — ningún E2E desactivado');
  return encontrados.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
