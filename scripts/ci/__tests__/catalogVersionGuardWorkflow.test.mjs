import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const ci = YAML.parse(readFileSync(path.join(RAIZ, '.github/workflows/ci.yml'), 'utf8'));
const job = ci.jobs['build-test-node'];
const pasoDelGuardian = job.steps.find((paso) => paso.run?.includes('catalog:version-guard'));

/** G2.3 (S7.2, design D15): el guardián compara contra el primer padre del merge, no contra `base.sha`. */
describe('job build-test-node de ci.yml · guardián de versión del catálogo', () => {
  it('descarga dos commits para tener el primer padre del merge cuando hace el checkout', () => {
    const checkout = job.steps.find((paso) => paso.uses?.startsWith('actions/checkout@'));

    expect(checkout.with['fetch-depth']).toBe(2);
  });

  it('compara contra HEAD^1 y no contra la base del evento cuando corre el guardián', () => {
    expect(pasoDelGuardian.run).toBe('npm run catalog:version-guard -- --base HEAD^1');
  });

  it('no trae la base del evento aparte cuando el primer padre ya está en el checkout', () => {
    const traeLaBase = job.steps.some((paso) => /git fetch .*BASE_REF/.test(paso.run ?? ''));

    expect(traeLaBase).toBe(false);
  });
});
