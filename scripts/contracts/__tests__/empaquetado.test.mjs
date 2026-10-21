import { bundle, createConfig } from '@redocly/openapi-core';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundleSpecs } from '../lib/context.mjs';
import { CLINICAL_API, EVIDENCE, PROVIDERS, SHARED_SCHEMAS } from '../lib/specs.mjs';
import { ROOT, realContracts } from './helpers/parches.mjs';

const EVIDENCE_REF = '../../contracts/schemas/evidence.yaml#/components/schemas';

/** Los specs crudos reales con `cambios` aplicados sobre una copia; empaqueta y devuelve la entrada del proveedor. */
async function empaquetarConCambios(provider, cambiar) {
  const real = await realContracts();
  const specs = Object.fromEntries(Object.entries(real.specs).map(([name, { file, raw }]) => [name, { file, raw: structuredClone(raw) }]));
  cambiar(specs[provider].raw);
  return (await bundleSpecs(specs))[provider];
}

describe('empaquetado en memoria con bundleDocument', () => {
  it.each(PROVIDERS)('coincide con el de @redocly/openapi-core cuando se empaqueta %s con los schemas compartidos [US-223 AC-1]', async (provider) => {
    const real = await realContracts();
    const config = await createConfig({ rules: { struct: 'error' } });
    const redocly = await bundle({ ref: path.join(ROOT, real.specs[provider].file), config });
    expect(real.specs[provider].bundled.components.schemas).toEqual(redocly.bundle.parsed.components.schemas);
  });

  it.each(PROVIDERS)('internaliza los schemas compartidos y no deja $ref externas cuando se empaqueta %s [US-223 AC-1]', async (provider) => {
    const real = await realContracts();
    const { bundled, externalRefs } = real.specs[provider];
    expect(externalRefs).toEqual([]);
    expect(Object.keys(bundled.components.schemas)).toEqual(expect.arrayContaining(SHARED_SCHEMAS));
    expect(JSON.stringify(bundled)).not.toMatch(/"\$ref":"[^#]/);
  });

  it('nombra el archivo y la $ref cuando apunta a una subruta inexistente de evidence.yaml [US-223 AC-2]', async () => {
    const entrada = await empaquetarConCambios(CLINICAL_API, (raw) => {
      raw.components.schemas.EvidenceOption = { $ref: `${EVIDENCE_REF}/EvidenceOption/properties/noExiste` };
    });
    expect(entrada.bundled).toBeNull();
    expect(entrada.error).toContain('apps/clinical-api/openapi.yaml: #/components/schemas/EvidenceOption: $ref externa sin resolver');
    expect(entrada.error).toContain('EvidenceOption/properties/noExiste');
    expect(entrada.externalRefs).toHaveLength(1);
  });

  it('nombra el archivo y el schema cuando el spec define un nombre que también trae evidence.yaml [US-223 AC-2]', async () => {
    const entrada = await empaquetarConCambios(CLINICAL_API, (raw) => {
      raw.components.schemas.CitedSourceFields = { type: 'object', properties: { distinto: { type: 'string' } } };
      raw.components.schemas.CitedSource = { allOf: [{ $ref: `${EVIDENCE_REF}/CitedSourceFields` }] };
    });
    expect(entrada.bundled).toBeNull();
    expect(entrada.error).toContain('apps/clinical-api/openapi.yaml: schema repetido CitedSourceFields');
  });

  it('deja el spec crudo intacto cuando empaqueta', async () => {
    const real = await realContracts();
    expect(real.specs[CLINICAL_API].raw.components.schemas.EvidenceOption).toEqual({
      $ref: '../../contracts/schemas/evidence.yaml#/components/schemas/EvidenceOption',
    });
    expect(real.specs[EVIDENCE].bundled).toBe(real.specs[EVIDENCE].raw);
  });
});
