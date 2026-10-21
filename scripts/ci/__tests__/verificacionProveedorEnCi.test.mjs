import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const ci = YAML.parse(readFileSync(path.join(RAIZ, '.github/workflows/ci.yml'), 'utf8'));
const paquete = JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
const comandosDe = (job) => (ci.jobs[job].steps ?? []).map((paso) => paso.run ?? '').join('\n');

describe('contracts:verify-provider en la CI [US-214 AC-1] (design D2)', () => {
  it('el job integration verifica clinical-api con PostgreSQL real a través de su script', () => {
    expect(comandosDe('integration')).toContain('scripts/ci/integracion-clinical-api.sh');
    const script = readFileSync(path.join(RAIZ, 'scripts/ci/integracion-clinical-api.sh'), 'utf8');

    expect(script).toContain('npm run contracts:verify-provider -- --proveedor clinical-api');
    expect(script.indexOf('up -d --wait postgres')).toBeLessThan(script.lastIndexOf('npm run contracts:verify-provider'));
  });

  it('el job build-test verifica rag-orchestrator con el Pytest de sus adapters falsos', () => {
    expect(comandosDe('build-test')).toContain('npm run contracts:verify-provider -- --proveedor rag-orchestrator');
  });

  it('ambos jobs son bloqueantes porque están en el needs de ci-ok', () => {
    expect(ci.jobs['ci-ok'].needs).toEqual(expect.arrayContaining(['integration', 'build-test']));
  });

  it('el script de la raíz ejecuta el verificador y contracts:breaking compara contra origin/main', () => {
    expect(paquete.scripts['contracts:verify-provider']).toBe('node scripts/contracts/verify-provider.mjs');
    expect(paquete.scripts['contracts:breaking']).toContain('scripts/ci/contracts-breaking.sh origin/main');
  });
});
