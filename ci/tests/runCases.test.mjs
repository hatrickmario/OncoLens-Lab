import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const ejecutar = promisify(execFile);
const RUNNER = path.resolve(import.meta.dirname, 'run-cases.mjs');

const temporales = [];
afterEach(async () => {
  await Promise.all(temporales.splice(0).map((directorio) => rm(directorio, { recursive: true, force: true })));
});

/** Corre el runner sobre un único caso pendiente; `archivados` son las carpetas de openspec/changes/archive/. */
async function correr({ archivados = [], argumentos = [] }) {
  const directorio = await mkdtemp(path.join(os.tmpdir(), 'oncolens-runner-'));
  temporales.push(directorio);
  const casos = path.join(directorio, 'casos');
  const archivo = path.join(directorio, 'archive');
  await mkdir(path.join(casos, 'dependiente'), { recursive: true });
  await mkdir(archivo);
  for (const carpeta of archivados) await mkdir(path.join(archivo, carpeta));
  const pendiente = { motivo: 'espera a l1d-999', hastaQueSeArchive: ['l1d-999-consumidor'] };
  await writeFile(path.join(casos, 'dependiente', 'case.json'), JSON.stringify({ ac: 'US-036 AC-2', esperado: 'falla', comando: 'true', pendiente }));
  const resultado = await ejecutar('node', [RUNNER, '--casos', casos, '--archivo', archivo, ...argumentos]).then(
    ({ stdout }) => ({ codigo: 0, stdout }),
    (error) => ({ codigo: error.code, stdout: error.stdout }),
  );
  return resultado;
}

describe('run-cases · casos pendientes', () => {
  it('lista el caso como PENDIENTE y sale con 0 mientras el change del que depende no esté archivado [US-036 AC-2]', async () => {
    const { codigo, stdout } = await correr({});

    expect(codigo).toBe(0);
    expect(stdout).toContain('PENDIENTE dependiente');
  });

  it('sale con 1 con --estricto mientras el caso siga pendiente [US-036 AC-2]', async () => {
    expect((await correr({ argumentos: ['--estricto'] })).codigo).toBe(1);
  });

  it('cuenta como FALLA cuando el change del que depende ya está archivado, también sin --estricto [US-036 AC-2]', async () => {
    const { codigo, stdout } = await correr({ archivados: ['2026-10-20-l1d-999-consumidor'] });

    expect(codigo).toBe(1);
    expect(stdout).toContain('FALLA     dependiente');
    expect(stdout).toContain('ya se archivó l1d-999-consumidor');
  });
});
