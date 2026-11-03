import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// ARR-11 D5-02 (test después): repositorio temporal con un «origin» local; el script se copia al clon para que su raíz sea el clon.
const RAIZ = path.resolve(import.meta.dirname, '../../..');
const SCRIPT_ORIGINAL = path.join(RAIZ, 'scripts/ci/contracts-contra-main.sh');
const TIEMPO_MAXIMO = 60_000;
const IDENTIDAD = ['-c', 'user.name=ci-selftest', '-c', 'user.email=ci-selftest@example.com', '-c', 'commit.gpgsign=false'];

// `contracts:check` de juguete: un ejemplo es inválido si le falta un campo que el schema declara requerido.
const CHECK = `import { readFileSync } from 'node:fs';
const requeridos = JSON.parse(readFileSync('contracts/schemas/s.json', 'utf8')).required;
const ejemplo = JSON.parse(readFileSync('contracts/examples/ej.json', 'utf8'));
const faltan = requeridos.filter((campo) => !(campo in ejemplo));
if (faltan.length) { console.error('contracts/examples/ej.json: falta el campo ' + faltan.join(', ')); process.exit(1); }
console.log('contracts:check ok');
`;

const temporales = [];
afterAll(() => temporales.forEach((carpeta) => rmSync(carpeta, { recursive: true, force: true })));

const git = (carpeta, ...parametros) => execFileSync('git', [...IDENTIDAD, '-C', carpeta, ...parametros], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function escribir(carpeta, ruta, contenido) {
  mkdirSync(path.dirname(path.join(carpeta, ruta)), { recursive: true });
  writeFileSync(path.join(carpeta, ruta), contenido);
}
function confirmar(carpeta, mensaje) {
  git(carpeta, 'add', '-A');
  git(carpeta, 'commit', '-q', '-m', mensaje);
}

/** `origen` (main) y `trabajo` (clon en una rama de PR). `avanzarMain(origen)` agrega commits a main después de crear la rama. */
function escenario({ cambiosDelPr, avanzarMain = () => {} }) {
  const padre = mkdtempSync(path.join(os.tmpdir(), 'contratos-contra-main-'));
  temporales.push(padre);
  const origen = path.join(padre, 'origen');
  mkdirSync(origen);
  git(origen, 'init', '-q', '-b', 'main');
  escribir(origen, 'package.json', JSON.stringify({ name: 'juguete', private: true, scripts: { 'contracts:check': 'node check.mjs' } }));
  escribir(origen, 'check.mjs', CHECK);
  escribir(origen, 'contracts/schemas/s.json', JSON.stringify({ required: [] }));
  escribir(origen, 'contracts/examples/ej.json', JSON.stringify({ a: 1 }));
  escribir(origen, 'apps/web/pagina.ts', 'export {};\n');
  mkdirSync(path.join(origen, 'scripts/ci'), { recursive: true });
  copyFileSync(SCRIPT_ORIGINAL, path.join(origen, 'scripts/ci/contracts-contra-main.sh'));
  chmodSync(path.join(origen, 'scripts/ci/contracts-contra-main.sh'), 0o755);
  confirmar(origen, 'base');
  const base = git(origen, 'rev-parse', 'HEAD');
  const trabajo = path.join(padre, 'trabajo');
  git(padre, 'clone', '-q', origen, trabajo);
  git(trabajo, 'checkout', '-q', '-b', 'pr');
  cambiosDelPr(trabajo);
  confirmar(trabajo, 'cambio del PR');
  avanzarMain(origen);
  return { origen, trabajo, base };
}

const ejecutar = ({ trabajo, base }, evento = 'pull_request') =>
  spawnSync('bash', [path.join(trabajo, 'scripts/ci/contracts-contra-main.sh'), base], {
    cwd: trabajo,
    encoding: 'utf8',
    timeout: 50_000,
    env: { ...process.env, GITHUB_EVENT_NAME: evento },
  });

const cambiarMain = (origen, ruta, contenido) => {
  escribir(origen, ruta, contenido);
  confirmar(origen, 'main avanza');
};

describe('contracts-contra-main.sh', () => {
  it('falla nombrando el ejemplo y el campo cuando un commit posterior de main volvió requerido un campo [D5-02]', () => {
    const entorno = escenario({
      cambiosDelPr: (c) => escribir(c, 'contracts/examples/ej.json', JSON.stringify({ a: 2 })),
      avanzarMain: (o) => cambiarMain(o, 'contracts/schemas/s.json', JSON.stringify({ required: ['campoNuevo'] })),
    });

    const resultado = ejecutar(entorno);

    expect(resultado.status).not.toBe(0);
    expect(resultado.stdout + resultado.stderr).toContain('contracts/examples/ej.json: falta el campo campoNuevo');
  }, TIEMPO_MAXIMO);

  it('pasa cuando main avanzó sin invalidar los ejemplos del PR [D5-02]', () => {
    const entorno = escenario({
      cambiosDelPr: (c) => escribir(c, 'contracts/examples/ej.json', JSON.stringify({ a: 2 })),
      avanzarMain: (o) => cambiarMain(o, 'otro.txt', 'otro\n'),
    });

    const resultado = ejecutar(entorno);

    expect(resultado.status).toBe(0);
    expect(resultado.stdout).toContain('contracts:check ok');
  }, TIEMPO_MAXIMO);

  it('imprime omitido y no fusiona main cuando el PR no toca ejemplos ni specs [D5-02]', () => {
    const entorno = escenario({
      cambiosDelPr: (c) => escribir(c, 'apps/web/pagina.ts', 'export const x = 1;\n'),
      avanzarMain: (o) => cambiarMain(o, 'contracts/schemas/s.json', JSON.stringify({ required: ['campoNuevo'] })),
    });
    const antes = git(entorno.trabajo, 'rev-parse', 'HEAD');

    const resultado = ejecutar(entorno);

    expect(resultado.status).toBe(0);
    expect(resultado.stdout).toContain('omitido: el PR no toca ejemplos ni specs');
    expect(git(entorno.trabajo, 'rev-parse', 'HEAD')).toBe(antes);
  }, TIEMPO_MAXIMO);

  it('imprime omitido cuando el evento no es un pull_request [D5-02] [US-036 AC-1]', () => {
    const entorno = escenario({ cambiosDelPr: (c) => escribir(c, 'contracts/examples/ej.json', JSON.stringify({ a: 2 })) });

    const resultado = ejecutar(entorno, 'push');

    expect(resultado.status).toBe(0);
    expect(resultado.stdout).toContain('omitido: el evento push no es un pull_request');
  }, TIEMPO_MAXIMO);

  it('falla con el mensaje fijo y las rutas, sin imprimir contenido, y deja el árbol limpio cuando hay conflicto con main [D5-02] [RN-14]', () => {
    const entorno = escenario({
      cambiosDelPr: (c) => escribir(c, 'contracts/examples/ej.json', JSON.stringify({ a: 'CONTENIDO-DEL-PR-QUE-NO-SE-IMPRIME' })),
      avanzarMain: (o) => cambiarMain(o, 'contracts/examples/ej.json', JSON.stringify({ a: 'CONTENIDO-DE-MAIN-QUE-NO-SE-IMPRIME' })),
    });
    const antes = git(entorno.trabajo, 'rev-parse', 'HEAD');

    const resultado = ejecutar(entorno);
    const salida = resultado.stdout + resultado.stderr;

    expect(resultado.status).toBe(1);
    expect(salida).toContain('el PR tiene conflictos con main: actualiza la rama');
    expect(salida).toContain('contracts/examples/ej.json');
    expect(salida).not.toContain('QUE-NO-SE-IMPRIME');
    expect(git(entorno.trabajo, 'rev-parse', 'HEAD')).toBe(antes);
    expect(git(entorno.trabajo, 'status', '--porcelain')).toBe('');
  }, TIEMPO_MAXIMO);

  it('sale con 2 y muestra el uso cuando no recibe la base [D5-02]', () => {
    const resultado = spawnSync('bash', [SCRIPT_ORIGINAL], { encoding: 'utf8', timeout: 30_000 });

    expect(resultado.status).toBe(2);
    expect(resultado.stderr).toContain('uso:');
  }, TIEMPO_MAXIMO);
});
