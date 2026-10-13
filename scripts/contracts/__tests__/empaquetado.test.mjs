import { bundle, createConfig } from '@redocly/openapi-core';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { externalRefsLeft } from '../lib/bundle.mjs';
import { PROVIDERS } from '../lib/specs.mjs';
import { ROOT, realContracts } from './helpers/parches.mjs';

describe('empaquetado en memoria', () => {
  it.each(PROVIDERS)('coincide con el de @redocly/openapi-core cuando se empaqueta %s con los schemas compartidos', async (provider) => {
    const real = await realContracts();
    const config = await createConfig({ rules: { struct: 'error' } });
    const redocly = await bundle({ ref: path.join(ROOT, real.specs[provider].file), config });
    expect(real.specs[provider].bundled.components.schemas).toEqual(redocly.bundle.parsed.components.schemas);
  });

  it('lista la $ref externa con su puntero cuando el empaquetado la deja sin resolver [US-033 AC-8]', () => {
    const bundled = { components: { schemas: { A: { $ref: '../otro.yaml#/components/schemas/A' }, B: { $ref: '#/components/schemas/C' } } } };
    expect(externalRefsLeft(bundled)).toEqual([{ pointer: '#/components/schemas/A', ref: '../otro.yaml#/components/schemas/A' }]);
  });

  it('deja el spec crudo intacto cuando empaqueta', async () => {
    const real = await realContracts();
    expect(real.specs['clinical-api'].raw.components.schemas.EvidenceOption).toEqual({
      $ref: '../../contracts/schemas/evidence.yaml#/components/schemas/EvidenceOption',
    });
  });
});
