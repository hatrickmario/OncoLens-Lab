import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const ci = YAML.parse(readFileSync(path.join(RAIZ, '.github/workflows/ci.yml'), 'utf8'));
const job = ci.jobs['higiene-proceso'];

describe('job higiene-proceso de ci.yml', () => {
  it('está en el needs de ci-ok y declara timeout-minutes explícito', () => {
    expect(ci.jobs['ci-ok'].needs).toContain('higiene-proceso');
    expect(job['timeout-minutes']).toBeGreaterThan(0);
  });

  it('corre siempre, sin filtros que lo dejarían omitido en ci-ok', () => {
    expect(job.if).toBeUndefined();
  });

  it('descarga el historial completo para poder listar los commits del PR', () => {
    const checkout = job.steps.find((paso) => paso.uses?.startsWith('actions/checkout@'));

    expect(checkout.with['fetch-depth']).toBe(0);
  });

  it('llama a los dos scripts y pasa el título del PR por una variable de entorno, no interpolado en el comando', () => {
    const pasos = job.steps.filter((paso) => paso.run);
    const tareas = pasos.find((paso) => paso.run.includes('tasks-destino.mjs'));

    expect(tareas.run).toBe('node scripts/ci/tasks-destino.mjs');
    expect(tareas.env.PR_TITLE).toBe('${{ github.event.pull_request.title }}');
    expect(
      pasos.some(
        (paso) => paso.run === 'node scripts/ci/verificar-commits-tdd.mjs --base "$BASE_REF"',
      ),
    ).toBe(true);
    expect(pasos.some((paso) => /\$\{\{\s*github\.event\.pull_request\.title/.test(paso.run))).toBe(
      false,
    );
  });
});
