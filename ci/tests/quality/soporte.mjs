// Ayudas compartidas de los tests de lint y formato (L1D-265). Solo ejecutan herramientas y copian fixtures.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';

export const RAIZ = path.resolve(import.meta.dirname, '../../..');
export const FIXTURES_FORMATO = path.join(import.meta.dirname, 'fixtures/formato');
const BIN = path.join(RAIZ, 'node_modules/.bin');
export const binLocal = (nombre) => path.join(BIN, nombre);

/** Ejecuta un comando y devuelve estado y salida unificada (stdout + stderr). */
export function ejecutar(comando, argumentos, { cwd = RAIZ, env = process.env } = {}) {
  const resultado = spawnSync(comando, argumentos, { cwd, env, encoding: 'utf8' });
  return {
    estado: resultado.status,
    error: resultado.error,
    salida: `${resultado.stdout ?? ''}${resultado.stderr ?? ''}`,
  };
}

export const npmRun = (script) => ejecutar('npm', ['run', script]);

/** Prettier con la configuración de la raíz, sin el .prettierignore (el fixture vive en un directorio ignorado). */
export function prettier(modo, archivos, cwd) {
  return ejecutar(
    path.join(BIN, 'prettier'),
    [modo, '--config', path.join(RAIZ, '.prettierrc.json'), ...archivos],
    { cwd },
  );
}

/** Ruff con la configuración de rag-orchestrator. Requiere `ruff` en el PATH. */
export function ruff(modo, archivos, cwd) {
  const configuracion = path.join(RAIZ, 'apps/rag-orchestrator/pyproject.toml');
  return ejecutar('ruff', ['format', ...modo, '--config', configuracion, ...archivos], { cwd });
}

/**
 * Copia fixtures a un directorio temporal nuevo y devuelve su ruta. Vive bajo node_modules/.cache (ignorado
 * por git) para que Prettier resuelva `prettier-plugin-tailwindcss` desde el node_modules de la raíz.
 */
export function copiarFixtures(nombres) {
  const base = path.join(RAIZ, 'node_modules/.cache/oncolens-quality');
  mkdirSync(base, { recursive: true });
  const destino = mkdtempSync(path.join(base, 'fixtures-'));
  for (const nombre of nombres) copyFileSync(path.join(FIXTURES_FORMATO, nombre), path.join(destino, nombre));
  return destino;
}
