import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const ejecutar = promisify(execFile);
const RAIZ = path.resolve(import.meta.dirname, '../../..');
const VITEST = path.join(RAIZ, 'node_modules/vitest/vitest.mjs');
const CONFIGURACION = path.join(RAIZ, 'vitest.config.ts');

const temporales = [];
afterEach(async () => {
  await Promise.all(temporales.splice(0).map((directorio) => rm(directorio, { recursive: true, force: true })));
});

/** Archivos de test que el vitest raíz recoge en `directorio`, con la configuración del repositorio. */
async function archivosRecogidos(directorio) {
  const informe = path.join(directorio, 'informe.json');
  const argumentos = [VITEST, 'run', '--reporter=json', `--outputFile=${informe}`, '--config', CONFIGURACION, '--root', directorio];
  await ejecutar('node', argumentos, { cwd: directorio }).catch(() => undefined); // los archivos vacíos fallan: solo importa cuáles se recogen
  return JSON.parse(await readFile(informe, 'utf8')).testResults.map((resultado) => path.relative(directorio, resultado.name));
}

describe('vitest.config.ts raíz', () => {
  it('no recoge tests bajo .claude/worktrees ni node_modules y sí los del resto del repositorio [US-036 AC-7]', async () => {
    const directorio = await realpath(await mkdtemp(path.join(os.tmpdir(), 'oncolens-vitest-')));
    temporales.push(directorio);
    const rutas = ['propio.test.mjs', '.claude/worktrees/otro/copia.test.mjs', 'apps/web/node_modules/dependencia/interno.test.mjs'];
    for (const ruta of rutas) {
      await mkdir(path.dirname(path.join(directorio, ruta)), { recursive: true });
      await writeFile(path.join(directorio, ruta), '// archivo de prueba vacío\n');
    }

    const recogidos = await archivosRecogidos(directorio);

    expect(recogidos).toEqual(['propio.test.mjs']);
  });
});
