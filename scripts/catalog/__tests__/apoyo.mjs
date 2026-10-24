import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const RAIZ = path.resolve(import.meta.dirname, '../../..');
export const CATALOGO = path.join(RAIZ, 'packages/clinical-catalogs');
export const FIXTURES = path.join(CATALOGO, 'test/fixtures');
const SCRIPT_VALIDAR = path.join(RAIZ, 'scripts/catalog/validate.mjs');

/** Plazo explícito de los procesos reales (el ciclo de la política TDD: sin esperas implícitas). */
export const PLAZO_PROCESO_MS = 30_000;

const copias = [];

/** Copia de un catálogo de fixture en un directorio temporal, para romperla sin tocar el original. */
export function copiarFixture(version) {
  const raiz = mkdtempSync(path.join(os.tmpdir(), 'catalogo-'));
  copias.push(raiz);
  const destino = path.join(raiz, version);
  cpSync(path.join(FIXTURES, version), destino, { recursive: true });
  return destino;
}

export function limpiarCopias() {
  for (const raiz of copias.splice(0)) rmSync(raiz, { recursive: true, force: true });
}

/** Lee, transforma y reescribe un JSON de la copia (`ruta` relativa al catálogo). */
export function modificarJson(catalogo, ruta, transformar) {
  const archivo = path.join(catalogo, ruta);
  const contenido = JSON.parse(readFileSync(archivo, 'utf8'));
  transformar(contenido);
  writeFileSync(archivo, `${JSON.stringify(contenido, null, 2)}\n`);
}

/** Ejecuta `catalog:validate` como proceso real sobre `catalogo`. */
export function ejecutarValidador(catalogo, extra = []) {
  const resultado = spawnSync(process.execPath, [SCRIPT_VALIDAR, '--dir', catalogo, ...extra], {
    encoding: 'utf8',
    timeout: PLAZO_PROCESO_MS,
  });
  return {
    codigo: resultado.status,
    salida: `${resultado.stdout}${resultado.stderr}`,
  };
}
