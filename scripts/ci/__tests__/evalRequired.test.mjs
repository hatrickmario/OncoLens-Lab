/**
 * Fixtures de PR del job `eval-required` (US-074 AC-1…AC-6, L1D-237): cada caso clona el repositorio con el árbol de
 * trabajo encima, aplica el cambio de un PR sintético, lo commitea y ejecuta `scripts/ci/eval-required.mjs` con la base
 * anterior, como lo hace la CI. Corre `evaluate` de verdad (adapters falsos): necesita las dependencias de Python de
 * `requirements-eval.txt`, que `build-test` instala antes del vitest raíz (EVAL_PYTHON elige el intérprete).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { listarArchivosVersionados } from '../lib/archivos.mjs';

const ORIGEN = path.resolve(import.meta.dirname, '../../..');
const IDENTIDAD = ['-c', 'user.name=ci-selftest', '-c', 'user.email=ci-selftest@example.com', '-c', 'commit.gpgsign=false'];
const git = (cwd, ...parametros) => execFileSync('git', [...IDENTIDAD, '-C', cwd, ...parametros], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const temporales = [];
afterAll(() => temporales.forEach((carpeta) => rmSync(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })));

/** Clon local con el árbol de trabajo actual como commit base (los fixtures prueban lo que hay en disco). */
function clonarConArbolActual() {
  const carpeta = mkdtempSync(path.join(os.tmpdir(), 'oncolens-eval-required-'));
  temporales.push(carpeta);
  const clon = path.join(carpeta, 'clon');
  git(ORIGEN, 'clone', '--local', '--quiet', ORIGEN, clon);
  const vigentes = new Set(listarArchivosVersionados(ORIGEN));
  git(clon, 'ls-files', '-z').split('\0').filter((ruta) => ruta && !vigentes.has(ruta)).forEach((ruta) => rmSync(path.join(clon, ruta), { force: true }));
  for (const ruta of vigentes) {
    mkdirSync(path.dirname(path.join(clon, ruta)), { recursive: true });
    cpSync(path.join(ORIGEN, ruta), path.join(clon, ruta), { dereference: false });
  }
  symlinkSync(path.join(ORIGEN, 'node_modules'), path.join(clon, 'node_modules'));
  git(clon, 'add', '-A');
  git(clon, 'commit', '--quiet', '--allow-empty', '-m', 'base del fixture');
  return clon;
}

/** Aplica el PR sintético (`cambios`: ruta → función que recibe el texto actual, o null si el archivo es nuevo) y lo commitea. */
function pr(cambios) {
  const clon = clonarConArbolActual();
  const base = git(clon, 'rev-parse', 'HEAD').trim();
  for (const [ruta, transformar] of Object.entries(cambios)) {
    const archivo = path.join(clon, ruta);
    mkdirSync(path.dirname(archivo), { recursive: true });
    writeFileSync(archivo, transformar(existsSync(archivo) ? readFileSync(archivo, 'utf8') : ''));
  }
  git(clon, 'add', '-A');
  git(clon, 'commit', '--quiet', '-m', 'cambio del PR');
  return { clon, base };
}

function correr({ clon, base }, entorno = {}) {
  const resultado = spawnSync('node', ['scripts/ci/eval-required.mjs', '--base', base], {
    cwd: clon,
    encoding: 'utf8',
    env: { ...process.env, ...entorno, GITHUB_STEP_SUMMARY: path.join(clon, 'resumen.md') },
    timeout: 120_000,
  });
  const leer = (ruta) => (existsSync(path.join(clon, ruta)) ? readFileSync(path.join(clon, ruta), 'utf8') : null);
  return {
    codigo: resultado.status,
    salida: `${resultado.stdout}${resultado.stderr}`,
    reporte: leer('apps/rag-orchestrator/eval/results/ci/reporte.json'),
    comentario: leer('apps/rag-orchestrator/eval/results/ci/comentario.md'),
    resumen: leer('resumen.md'),
  };
}

const agregarLinea = (linea) => (texto) => `${texto}\n${linea}\n`;
const CAMBIO_DE_PROMPT = { 'apps/rag-orchestrator/app/prompts/rag_query.py': agregarLinea('# retoque del prompt (fixture)') };
const exigirBaseline = (precision) => (texto) => texto.replace('"precision": 0.8,', `"precision": ${precision},`);

describe('eval-required', { timeout: 90_000 }, () => {
  it('ejecuta evaluate, publica el reporte y la tabla con la marca de validación cuando el PR cambia un prompt [US-074 AC-1] [US-074 AC-6]', () => {
    const resultado = correr(pr(CAMBIO_DE_PROMPT));

    expect(resultado.codigo).toBe(0);
    expect(JSON.parse(resultado.reporte).esquema).toBe('oncolens.evaluate.v1');
    expect(resultado.comentario).toContain('| Métrica | Baseline | Actual | Validación | Estado |');
    expect(resultado.comentario).toContain('| completa.recuperacion.total.recall_at_10 | 1 | 1 | no validada | igual |');
    expect(resultado.resumen).toBe(resultado.comentario);
  });

  it('ejecuta evaluate cuando el PR cambia un catálogo clínico [US-074 AC-2]', () => {
    const resultado = correr(pr({ 'packages/clinical-catalogs/mama/codigos.json': (texto) => `${texto}\n` }));

    expect(resultado.reporte).not.toBeNull();
  });

  it('ejecuta evaluate cuando el PR cambia RELEVANCE_THRESHOLD en .env.example [US-074 AC-3]', () => {
    const resultado = correr(pr({ 'infra/docker/.env.example': agregarLinea('RELEVANCE_THRESHOLD=0.35') }));

    expect(resultado.reporte).not.toBeNull();
    expect(resultado.comentario).toContain('clave: `infra/docker/.env.example`');
  });

  it('no ejecuta evaluate y lo indica cuando el PR solo cambia apps/web [US-074 AC-1]', () => {
    const resultado = correr(pr({ 'apps/web/app/login/nota.txt': agregarLinea('sin relación con la IA') }));

    expect(resultado.codigo).toBe(0);
    expect(resultado.reporte).toBeNull();
    expect(resultado.salida).toContain('omitido: ningún disparador en el diff');
    expect(resultado.resumen).toContain('`evaluate` no se ejecutó');
  });

  it('falla y nombra la métrica cuando el PR cambia un prompt y una métrica cae bajo el baseline [US-074 AC-5]', () => {
    const resultado = correr(pr({ ...CAMBIO_DE_PROMPT, 'data/evaluation/baseline.json': exigirBaseline(0.95) }));

    expect(resultado.codigo).toBe(1);
    expect(resultado.salida).toContain('regresión en completa.citas.precision: baseline 0.95, actual 0.8');
    expect(resultado.comentario).toContain('| completa.citas.precision | 0.95 | 0.8 | no validada | regresión |');
  });

  it('pasa cuando la caída cabe en EVAL_MAX_REGRESSION [US-074 AC-5]', () => {
    const resultado = correr(pr({ ...CAMBIO_DE_PROMPT, 'data/evaluation/baseline.json': exigirBaseline(0.95) }), { EVAL_MAX_REGRESSION: '0.2' });

    expect(resultado.codigo).toBe(0);
    expect(resultado.comentario).toContain('caída tolerada');
  });

  it('sale con 2 cuando EVAL_MAX_REGRESSION no es un número válido [US-074 AC-5]', () => {
    const resultado = correr(pr(CAMBIO_DE_PROMPT), { EVAL_MAX_REGRESSION: 'mucho' });

    expect(resultado.codigo).toBe(2);
    expect(resultado.reporte).toBeNull();
  });

  it('pasa con el aviso cuando no hay baseline contra el que comparar [US-074 AC-4]', () => {
    const fixture = pr(CAMBIO_DE_PROMPT);
    rmSync(path.join(fixture.clon, 'data/evaluation/baseline.json'));

    const resultado = correr(fixture);

    expect(resultado.codigo).toBe(0);
    expect(resultado.comentario).toContain('Sin baseline de regresión: umbral no aplicado');
  });
});
