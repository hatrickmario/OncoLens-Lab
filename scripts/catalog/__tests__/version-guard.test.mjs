import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FIXTURES, PLAZO_PROCESO_MS, RAIZ } from './apoyo.mjs';

/** Pruebas de aceptación de `catalog:version-guard` (L1D-126, decisión del usuario 2026-10-24): repos Git temporales. */
const SCRIPT = path.join(RAIZ, 'scripts/catalog/version-guard.mjs');
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

/** Repo temporal con `catalogo/` (copia de test-apl-1.0.0) confirmado en `main` y una rama `cambio` encima. */
function repoConCatalogo(preparar = () => {}) {
  const raiz = mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  repos.push(raiz);
  git(raiz, 'init', '-q', '-b', 'main');
  cpSync(path.join(FIXTURES, 'test-apl-1.0.0'), path.join(raiz, 'catalogo'), { recursive: true });
  preparar(raiz);
  git(raiz, 'add', '-A');
  git(raiz, 'commit', '-q', '-m', 'base');
  git(raiz, 'checkout', '-q', '-b', 'cambio');
  return raiz;
}

function modificar(raiz, archivo, transformar) {
  const ruta = path.join(raiz, 'catalogo', archivo);
  const contenido = JSON.parse(readFileSync(ruta, 'utf8'));
  transformar(contenido);
  writeFileSync(ruta, `${JSON.stringify(contenido, null, 2)}\n`);
}

const agregarContenido = (contenido) => {
  const lista = contenido.items ?? contenido.keys;
  lista.push({ key: 'nuevo', cancerTypes: ['mama'], cancerType: 'mama' });
};

function ejecutar(raiz, { base = 'main', ci = false } = {}) {
  const env = { ...process.env, CI: ci ? 'true' : '' };
  const resultado = spawnSync(
    process.execPath,
    [SCRIPT, '--dir', path.join(raiz, 'catalogo'), '--base', base],
    { cwd: raiz, encoding: 'utf8', timeout: PLAZO_PROCESO_MS, env },
  );
  return { codigo: resultado.status, salida: `${resultado.stdout}${resultado.stderr}` };
}

describe('catalog:version-guard · contenido cambiado sin subir versión', () => {
  it.each([
    'mama/aplicabilidad.json',
    'mama/datos-criticos.json',
    'atributos.json',
    'poblacion.json',
  ])(
    'falla y nombra %s cuando su contenido cambia y manifest.version es igual a la de la base',
    (archivo) => {
      const raiz = repoConCatalogo();
      modificar(raiz, archivo, agregarContenido);

      const resultado = ejecutar(raiz);

      expect(resultado.codigo).toBe(1);
      expect(resultado.salida).toContain(
        `contenido_cambiado_sin_subir_version ${archivo.replace('.json', '')}`,
      );
      expect(resultado.salida).not.toContain(raiz);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'pasa cuando el contenido cambia y manifest.version es nueva',
    () => {
      const raiz = repoConCatalogo();
      modificar(raiz, 'mama/aplicabilidad.json', agregarContenido);
      modificar(raiz, 'manifest.json', (m) => (m.version = 'test-apl-1.0.2'));

      expect(ejecutar(raiz).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'pasa cuando el contenido de la base estaba vacío (primera publicación)',
    () => {
      const raiz = repoConCatalogo();
      modificar(raiz, 'prostata/aplicabilidad.json', agregarContenido);

      expect(ejecutar(raiz).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'pasa cuando un archivo no existía en la base',
    () => {
      const raiz = repoConCatalogo();
      git(raiz, 'checkout', '-q', 'main');
      rmSync(path.join(raiz, 'catalogo/poblacion.json'));
      git(raiz, 'add', '-A');
      git(raiz, 'commit', '-q', '-m', 'sin poblacion');
      git(raiz, 'checkout', '-q', '-b', 'otra');
      cpSync(
        path.join(FIXTURES, 'test-apl-1.0.0/poblacion.json'),
        path.join(raiz, 'catalogo/poblacion.json'),
      );

      expect(ejecutar(raiz).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'pasa cuando ningún archivo cambió',
    () => {
      const raiz = repoConCatalogo();

      const resultado = ejecutar(raiz);

      expect(resultado.codigo).toBe(0);
      expect(resultado.salida).toContain('catalog:version-guard OK');
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:version-guard · el archivo entero cuenta, no solo sus ítems (Gate 2 M-1)', () => {
  it(
    'falla y nombra mama/datos-criticos cuando cambia verifiedReviewStatuses con la misma versión',
    () => {
      const raiz = repoConCatalogo();
      modificar(raiz, 'mama/datos-criticos.json', (c) => c.verifiedReviewStatuses.push('otro'));

      const resultado = ejecutar(raiz);

      expect(resultado.codigo).toBe(1);
      expect(resultado.salida).toContain(
        'contenido_cambiado_sin_subir_version mama/datos-criticos',
      );
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:version-guard · tipos quitados, base ilegible, versión que no sube y alcance (Gate 2 m-1, m-2, m-3, P-1)', () => {
  const escribirEnLaBase = (archivo, contenido) => (raiz) => {
    const ruta = path.join(raiz, 'catalogo', archivo);
    mkdirSync(path.dirname(ruta), { recursive: true });
    writeFileSync(ruta, typeof contenido === 'string' ? contenido : JSON.stringify(contenido));
  };

  it(
    'falla cuando se quita un tipo del manifiesto y su carpeta con la misma versión (m-1)',
    () => {
      const raiz = repoConCatalogo();
      rmSync(path.join(raiz, 'catalogo/prostata'), { recursive: true });
      modificar(raiz, 'manifest.json', (m) => (m.cancerTypes = ['mama']));

      const resultado = ejecutar(raiz);

      expect(resultado.codigo).toBe(1);
      expect(resultado.salida).toContain(
        'contenido_cambiado_sin_subir_version prostata/datos-criticos',
      );
      expect(resultado.salida).toContain('contenido_cambiado_sin_subir_version manifest');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'falla cerrado en CI y nombra atributos cuando el archivo de la base no es JSON (m-2)',
    () => {
      const raiz = repoConCatalogo(escribirEnLaBase('atributos.json', '{no es json'));

      const resultado = ejecutar(raiz, { ci: true });

      expect(resultado.codigo).toBe(1);
      expect(resultado.salida).toContain('base_ilegible atributos');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'avisa y pasa en local cuando el archivo de la base no es JSON (m-2)',
    () => {
      const raiz = repoConCatalogo(escribirEnLaBase('atributos.json', '{no es json'));

      const resultado = ejecutar(raiz, { ci: false });

      expect(resultado.codigo).toBe(0);
      expect(resultado.salida).toContain('base_ilegible atributos');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'falla con version_no_sube cuando la versión baja y el contenido cambió (m-3)',
    () => {
      const raiz = repoConCatalogo((r) =>
        escribirEnLaBase('manifest.json', {
          version: 'test-apl-1.2.0',
          cancerTypes: ['mama', 'prostata'],
          standards: ['cie10', 'loinc', 'atc'],
        })(r),
      );
      modificar(raiz, 'mama/aplicabilidad.json', agregarContenido);
      modificar(raiz, 'manifest.json', (m) => (m.version = 'test-apl-1.1.0'));

      const resultado = ejecutar(raiz);

      expect(resultado.codigo).toBe(1);
      expect(resultado.salida).toContain('version_no_sube mama/aplicabilidad');
    },
    PLAZO_PROCESO_MS,
  );

  it.each([
    ['mama/sinonimos.json', { version: 'test-apl-1.0.0', items: [{ k: 1 }] }],
    ['mama/codigos.json', { entradas: [{ codigo: 'C50.9' }] }],
    ['mama/tendencias.json', { version: 'test-apl-1.0.0', estado: 'propuesta', items: [{ k: 1 }] }],
    ['mama/plantillas.json', { version: 'test-apl-1.0.0', items: [{ k: 1 }] }],
  ])(
    'falla y nombra %s cuando un archivo versionado del catálogo cambia con la misma versión (P-1)',
    (archivo, contenido) => {
      const raiz = repoConCatalogo(escribirEnLaBase(archivo, contenido));
      modificar(raiz, archivo, (c) => (c.items ?? c.entradas).push({ k: 2 }));

      const resultado = ejecutar(raiz);

      expect(resultado.codigo).toBe(1);
      expect(resultado.salida).toContain(
        `contenido_cambiado_sin_subir_version ${archivo.replace('.json', '')}`,
      );
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'falla cuando lenguaje/terminos-prohibidos cambia con su misma version propia (P-1)',
    () => {
      const raiz = repoConCatalogo(
        escribirEnLaBase('lenguaje/terminos-prohibidos.json', {
          version: '1.5.0',
          nivelA: { terminos: [] },
        }),
      );
      modificar(raiz, 'lenguaje/terminos-prohibidos.json', (c) =>
        c.nivelA.terminos.push({ id: 'x' }),
      );

      const resultado = ejecutar(raiz);

      expect(resultado.codigo).toBe(1);
      expect(resultado.salida).toContain(
        'contenido_cambiado_sin_subir_version lenguaje/terminos-prohibidos',
      );
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:version-guard · sin base disponible', () => {
  it(
    'falla cerrado cuando la base no existe y CI=true',
    () => {
      const raiz = repoConCatalogo();

      const resultado = ejecutar(raiz, { base: 'origin/main', ci: true });

      expect(resultado.codigo).toBe(1);
      expect(resultado.salida).toContain('base_no_disponible');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'avisa y pasa cuando la base no existe en local',
    () => {
      const raiz = repoConCatalogo();

      const resultado = ejecutar(raiz, { base: 'origin/main', ci: false });

      expect(resultado.codigo).toBe(0);
      expect(resultado.salida).toContain('base_no_disponible');
    },
    PLAZO_PROCESO_MS,
  );
});
