import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const ci = YAML.parse(readFileSync(path.join(RAIZ, '.github/workflows/ci.yml'), 'utf8'));
const job = ci.jobs['eval-required'];
const pasos = job.steps;

describe('job eval-required de ci.yml', () => {
  it('está en el needs de ci-ok y declara timeout-minutes explícito [US-074 AC-1]', () => {
    expect(ci.jobs['ci-ok'].needs).toContain('eval-required');
    expect(job['timeout-minutes']).toBeGreaterThan(0);
  });

  it('corre siempre, sin filtro de rutas del workflow que dejaría el check pendiente [US-074 AC-1]', () => {
    expect(job.if).toBeUndefined();
    expect(ci.on.pull_request).toBeNull();
  });

  it('llama al script con la base del PR y no lleva lógica de detección en el YAML [US-074 AC-1]', () => {
    const corridas = pasos.map((paso) => paso.run ?? '');

    expect(corridas).toContain('node scripts/ci/eval-required.mjs --base "$BASE_REF"');
    expect(corridas.filter((run) => /\bgit diff\b|\bgrep\b|\bif \[/.test(run))).toEqual([]);
  });

  it('descarga el historial completo para poder calcular el diff contra la base [US-074 AC-1]', () => {
    const checkout = pasos.find((paso) => paso.uses?.startsWith('actions/checkout@'));

    expect(checkout.with['fetch-depth']).toBe(0);
  });

  it('instala Node y Python antes de ejecutar la suite [US-074 AC-1]', () => {
    const indiceSuite = pasos.findIndex((paso) => /eval-required\.mjs/.test(paso.run ?? ''));
    const previos = pasos.slice(0, indiceSuite);

    expect(previos.some((paso) => paso.uses?.startsWith('actions/setup-node@'))).toBe(true);
    expect(previos.some((paso) => paso.uses?.startsWith('actions/setup-python@'))).toBe(true);
    expect(previos.some((paso) => /\bnpm ci\b/.test(paso.run ?? ''))).toBe(true);
    expect(previos.some((paso) => /requirements-eval\.txt/.test(paso.run ?? ''))).toBe(true);
  });

  it('impide a las librerías de modelos descargar nada durante la suite (RN-12) [US-074 AC-1]', () => {
    expect(job.env).toMatchObject({ HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' });
  });

  it('publica el reporte como artefacto aunque la suite falle, con retención corta [US-074 AC-1]', () => {
    const publicacion = pasos.find((paso) => paso.uses?.startsWith('actions/upload-artifact@'));

    expect(publicacion.if).toBe('always()');
    expect(publicacion.with['retention-days']).toBeLessThanOrEqual(3);
    expect(publicacion.with['include-hidden-files']).toBe(false);
  });
});
