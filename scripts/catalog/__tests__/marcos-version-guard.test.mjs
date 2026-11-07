import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FIXTURES, PLAZO_PROCESO_MS, RAIZ } from './apoyo.mjs';

/** `catalog:version-guard` y el léxico de marcos de pregunta, con versión propia (L1D-329, [US-271 AC-8]). */
const SCRIPT = path.join(RAIZ, 'scripts/catalog/version-guard.mjs');
const ARCHIVO = 'lenguaje/marcos-de-pregunta.json';
const repos = [];

afterEach(() => {
  for (const raiz of repos.splice(0)) rmSync(raiz, { recursive: true, force: true });
});

const git = (cwd, ...args) =>
  spawnSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t.test', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8' },
  );

const marcos = {
  version: '1.6.0',
  es: { marcos: ['a'], vacias: ['b'] },
  en: { marcos: ['c'], vacias: ['d'] },
};

function escribirMarcos(raiz, contenido) {
  const ruta = path.join(raiz, 'catalogo', ARCHIVO);
  mkdirSync(path.dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify(contenido));
}

/** Repo temporal con el catálogo base en `main` (con o sin el léxico) y una rama `cambio` encima. */
function repoConCatalogo({ conMarcosEnLaBase }) {
  const raiz = mkdtempSync(path.join(os.tmpdir(), 'guard-marcos-'));
  repos.push(raiz);
  git(raiz, 'init', '-q', '-b', 'main');
  cpSync(path.join(FIXTURES, 'test-apl-1.0.0'), path.join(raiz, 'catalogo'), { recursive: true });
  if (conMarcosEnLaBase) escribirMarcos(raiz, marcos);
  git(raiz, 'add', '-A');
  git(raiz, 'commit', '-q', '-m', 'base');
  git(raiz, 'checkout', '-q', '-b', 'cambio');
  return raiz;
}

function modificarMarcos(raiz, transformar) {
  const ruta = path.join(raiz, 'catalogo', ARCHIVO);
  const contenido = JSON.parse(readFileSync(ruta, 'utf8'));
  transformar(contenido);
  writeFileSync(ruta, `${JSON.stringify(contenido, null, 2)}\n`);
}

function ejecutar(raiz) {
  const resultado = spawnSync(
    process.execPath,
    [SCRIPT, '--dir', path.join(raiz, 'catalogo'), '--base', 'main'],
    { cwd: raiz, encoding: 'utf8', timeout: PLAZO_PROCESO_MS, env: { ...process.env, CI: '' } },
  );
  return { codigo: resultado.status, salida: `${resultado.stdout}${resultado.stderr}` };
}

describe('catalog:version-guard · lenguaje/marcos-de-pregunta', () => {
  it(
    'falla y nombra el archivo cuando el contenido cambia con su misma version propia [US-271 AC-8]',
    () => {
      const raiz = repoConCatalogo({ conMarcosEnLaBase: true });
      modificarMarcos(raiz, (c) => c.es.vacias.push('e'));

      const resultado = ejecutar(raiz);

      expect(resultado.codigo).toBe(1);
      expect(resultado.salida).toContain(
        'contenido_cambiado_sin_subir_version lenguaje/marcos-de-pregunta',
      );
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'pasa cuando el contenido cambia y la version propia sube [US-271 AC-8]',
    () => {
      const raiz = repoConCatalogo({ conMarcosEnLaBase: true });
      modificarMarcos(raiz, (c) => {
        c.es.vacias.push('e');
        c.version = '1.7.0';
      });

      expect(ejecutar(raiz).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'pasa en la primera publicacion cuando la base no tiene el archivo [US-271 AC-8]',
    () => {
      const raiz = repoConCatalogo({ conMarcosEnLaBase: false });
      escribirMarcos(raiz, marcos);

      expect(ejecutar(raiz).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );
});
