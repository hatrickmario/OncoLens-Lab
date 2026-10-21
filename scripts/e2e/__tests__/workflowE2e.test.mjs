import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

// L1D-278 (test después, ARR-02 AC-1): forma del workflow e2e.yml. Las reglas comunes a todos los workflows (acciones por SHA,
// permissions, sin secrets, persist-credentials) las comprueba ci/tests/workflow.test.mjs para cada archivo de .github/workflows.
const RAIZ = path.resolve(import.meta.dirname, '../../..');
const leer = (nombre) => readFileSync(path.join(RAIZ, '.github/workflows', nombre), 'utf8');
const e2e = YAML.parse(leer('e2e.yml'));
const ci = YAML.parse(leer('ci.yml'));
const job = e2e.jobs.e2e;
const pasos = job.steps;
const indiceDe = (patron) => pasos.findIndex((paso) => patron.test(paso.run ?? paso.uses ?? ''));

describe('e2e.yml', () => {
  it('es un workflow aparte: ningún job suyo está en el needs de ci-ok [ARR-02 AC-1]', () => {
    expect(Object.keys(e2e.jobs)).toEqual(['e2e']);
    expect(ci.jobs['ci-ok'].needs).not.toContain('e2e');
    expect(Object.keys(ci.jobs)).not.toContain('e2e');
  });

  it('corre en pull_request y en push a main con un tiempo máximo explícito [ARR-02 AC-1]', () => {
    expect(Object.keys(e2e.on).sort()).toEqual(['pull_request', 'push']);
    expect(e2e.on.push.branches).toEqual(['main']);
    expect(job['timeout-minutes']).toBeGreaterThan(0);
    expect(job['timeout-minutes']).toBeLessThanOrEqual(30);
  });

  it('rechaza E2E desactivados antes de levantar el stack [ARR-02 AC-1]', () => {
    const indiceCheck = indiceDe(/verificar-e2e-activos\.mjs/);
    const indiceE2e = indiceDe(/npm run test:e2e/);

    expect(indiceCheck).toBeGreaterThanOrEqual(0);
    expect(indiceCheck).toBeLessThan(indiceE2e);
  });

  it('instala dependencias y Chromium con sus dependencias del sistema antes de ejecutar los E2E [ARR-02 AC-1]', () => {
    const indiceE2e = indiceDe(/npm run test:e2e/);

    expect(indiceDe(/\bnpm ci\b/)).toBeLessThan(indiceE2e);
    expect(indiceDe(/playwright install --with-deps chromium/)).toBeGreaterThanOrEqual(0);
    expect(indiceDe(/playwright install --with-deps chromium/)).toBeLessThan(indiceE2e);
  });

  it('prueba con Playwright real que el informe no conserva la contraseña, tras instalar Chromium y antes del stack [ARR-02 AC-1]', () => {
    const indiceSonda = indiceDe(/vitest\.integracion\.config\.mjs/);

    expect(indiceSonda).toBeGreaterThan(indiceDe(/playwright install --with-deps chromium/));
    expect(indiceSonda).toBeLessThan(indiceDe(/npm run test:e2e/));
  });

  it('ejecuta los E2E con CI=true para activar retries y traza [ARR-02 AC-1]', () => {
    const paso = pasos[indiceDe(/npm run test:e2e/)];

    expect(paso.env).toEqual({ CI: 'true' });
  });

  it('publica informe y trazas aunque falle, con retención de 3 días [ARR-02 AC-1]', () => {
    const paso = pasos.find((p) => p.uses?.startsWith('actions/upload-artifact@'));

    expect(paso.if).toBe('always()');
    expect(paso.with['retention-days']).toBe(3);
    expect(paso.with['include-hidden-files']).toBe(false);
    expect(paso.with.path).toContain('apps/web/playwright-report');
    expect(paso.with.path).toContain('apps/web/test-results');
  });

  it('no declara variables de entorno con contraseñas ni correos de E2E: los genera ejecutar.sh [ARR-02 AC-1]', () => {
    expect(leer('e2e.yml')).not.toMatch(/E2E_DOC_|CONTRASENA|PASSWORD/i);
  });

  it('las acciones comunes usan las mismas versiones (SHA) que ci.yml [ARR-02 AC-1]', () => {
    const accionesDe = (workflow) =>
      Object.fromEntries(Object.values(workflow.jobs).flatMap((j) => j.steps).filter((p) => p.uses).map((p) => p.uses.split('@')).map(([nombre, sha]) => [nombre, sha]));
    const deCi = accionesDe(ci);

    for (const [nombre, sha] of Object.entries(accionesDe(e2e))) if (deCi[nombre]) expect(sha, nombre).toBe(deCi[nombre]);
  });
});
