import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { archivosDelPr, medirCoberturaDelPr } from '../../../scripts/quality/cobertura.mjs';

// L1D-285, Gate 2 #10: «sin informes» (null) no se confunde con «Git roto» (lanza), y en la CI los informes son obligatorios.
const TIEMPO_MAXIMO_MS = 60_000;
const temporales = [];
afterAll(() => temporales.forEach((carpeta) => rmSync(carpeta, { recursive: true, force: true })));

function git(raiz, ...argumentos) {
  const identidad = ['-c', 'user.name=ci-selftest', '-c', 'user.email=ci-selftest@example.com', '-c', 'commit.gpgsign=false'];
  const resultado = spawnSync('git', [...identidad, ...argumentos], { cwd: raiz, encoding: 'utf8', timeout: 30_000 });
  expect(resultado.status, resultado.stderr).toBe(0);
}

/** Repositorio temporal con un commit y, si se pide, el LCOV de web (vacío: basta para que haya un informe). */
function repositorio({ conLcov }) {
  const raiz = mkdtempSync(path.join(os.tmpdir(), 'oncolens-cobertura-ci-'));
  temporales.push(raiz);
  git(raiz, 'init', '--quiet');
  writeFileSync(path.join(raiz, 'a.txt'), 'a\n');
  if (conLcov) {
    mkdirSync(path.join(raiz, 'apps/web/coverage'), { recursive: true });
    writeFileSync(path.join(raiz, 'apps/web/coverage/lcov.info'), 'TN:\n');
  }
  git(raiz, 'add', 'a.txt');
  git(raiz, 'commit', '--quiet', '-m', 'base');
  return raiz;
}

describe('medirCoberturaDelPr', () => {
  it('devuelve null cuando no hay ningún informe de cobertura y no es la CI [US-213 AC-11]', () => {
    expect(medirCoberturaDelPr(repositorio({ conLcov: false }), { env: {} })).toBeNull();
  }, TIEMPO_MAXIMO_MS);

  it('lanza nombrando los informes esperados cuando es la CI y faltan [US-213 AC-11]', () => {
    expect(() => medirCoberturaDelPr(repositorio({ conLcov: false }), { env: { CI: 'true' } })).toThrowError(
      /faltan los informes esperados en la CI: apps\/web\/coverage\/lcov\.info/,
    );
  }, TIEMPO_MAXIMO_MS);

  it('lanza en vez de devolver null cuando la rama base no existe [US-213 AC-11]', () => {
    const raiz = repositorio({ conLcov: true });

    expect(() => medirCoberturaDelPr(raiz, { env: {}, baseGit: 'origin/no-existe' })).toThrowError(/git merge-base/);
  }, TIEMPO_MAXIMO_MS);

  it('lee COBERTURA_BASE del entorno y lanza cuando apunta a una rama inexistente [US-213 AC-11]', () => {
    const raiz = repositorio({ conLcov: true });

    expect(() => medirCoberturaDelPr(raiz, { env: { COBERTURA_BASE: 'origin/no-existe' } })).toThrowError(/git merge-base/);
  }, TIEMPO_MAXIMO_MS);

  it('devuelve una lista vacía, no null, cuando hay informe y el diff contra la base está vacío [US-213 AC-11]', () => {
    const raiz = repositorio({ conLcov: true });

    expect(medirCoberturaDelPr(raiz, { env: {}, baseGit: 'HEAD' })).toEqual([]);
  }, TIEMPO_MAXIMO_MS);
});

describe('archivosDelPr', () => {
  it('devuelve null cuando la rama base no existe en el clon, para medir todo [US-213 AC-9]', () => {
    expect(archivosDelPr(repositorio({ conLcov: false }), { env: {}, baseGit: 'origin/no-existe' })).toBeNull();
  }, TIEMPO_MAXIMO_MS);

  it('devuelve los archivos que cambia la rama respecto de la base [US-213 AC-9]', () => {
    const raiz = repositorio({ conLcov: false });
    writeFileSync(path.join(raiz, 'b.txt'), 'b\n');
    git(raiz, 'add', 'b.txt');
    git(raiz, 'commit', '--quiet', '-m', 'cambio');

    expect(archivosDelPr(raiz, { env: {}, baseGit: 'HEAD~1' })).toEqual(['b.txt']);
  }, TIEMPO_MAXIMO_MS);
});
