import { bundle, createConfig } from '@redocly/openapi-core';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getBundledSpecs, calcularSpecsEmpaquetados } from '../lib/bundledSpecs.mjs';
import { bundleSpecs } from '../lib/context.mjs';
import { assertSharedSchemasSingleOrigin } from '../rules/assertSharedSchemasSingleOrigin.mjs';
import { CLINICAL_API, EVIDENCE, PROVIDERS, SHARED_SCHEMAS } from '../lib/specs.mjs';
import { ROOT, realContracts } from './helpers/parches.mjs';

const EVIDENCE_REF = '../../contracts/schemas/evidence.yaml#/components/schemas';

/** Los specs crudos reales con `cambios` aplicados sobre una copia, empaquetados. */
async function empaquetarSpecsConCambios(provider, cambiar) {
  const real = await realContracts();
  const specs = Object.fromEntries(Object.entries(real.specs).map(([name, { file, raw }]) => [name, { file, raw: structuredClone(raw) }]));
  cambiar(specs[provider].raw);
  return bundleSpecs(specs);
}

/** Empaqueta con `cambios` y devuelve la entrada del proveedor. */
async function empaquetarConCambios(provider, cambiar) {
  return (await empaquetarSpecsConCambios(provider, cambiar))[provider];
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

  it('nombra el archivo y la $ref cuando apunta a una subruta inexistente de evidence.yaml [US-223 AC-2] [US-033 AC-8]', async () => {
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
    expect(entrada.error).toContain('apps/clinical-api/openapi.yaml: schema repetido o derivado CitedSourceFields');
  });

  it('deja el spec crudo intacto cuando empaqueta', async () => {
    const real = await realContracts();
    expect(real.specs[CLINICAL_API].raw.components.schemas.EvidenceOption).toEqual({
      $ref: '../../contracts/schemas/evidence.yaml#/components/schemas/EvidenceOption',
    });
    expect(real.specs[EVIDENCE].bundled).toEqual(real.specs[EVIDENCE].raw);
  });

  it('reporta el error del empaquetado una vez cuando un schema derivado de una subruta deja el spec sin empaquetar [US-223 AC-2]', async () => {
    const specs = await empaquetarSpecsConCambios(CLINICAL_API, (raw) => {
      raw.components.schemas.OpcionDerivada = { $ref: `${EVIDENCE_REF}/EvidenceOption/properties/option` };
    });
    const hallazgos = assertSharedSchemasSingleOrigin(specs);
    expect(specs[CLINICAL_API].bundled).toBeNull();
    expect(hallazgos.filter((item) => item.file === 'apps/clinical-api/openapi.yaml' && item.message.includes('schema repetido o derivado'))).toHaveLength(1);
  });

  it('reporta la colisión una sola vez cuando el spec define un nombre de evidence.yaml [US-223 AC-2]', async () => {
    const specs = await empaquetarSpecsConCambios(CLINICAL_API, (raw) => {
      raw.components.schemas.CitedSourceFields = { type: 'object', properties: { distinto: { type: 'string' } } };
      raw.components.schemas.CitedSource = { allOf: [{ $ref: `${EVIDENCE_REF}/CitedSourceFields` }] };
    });
    const hallazgos = assertSharedSchemasSingleOrigin(specs).filter((item) => item.message.includes('CitedSourceFields'));
    expect(hallazgos).toHaveLength(1);
  });
});

describe('specs empaquetados registrados', () => {
  // Otra clave de caché con el mismo contenido: el worker ya registró la raíz por defecto.
  const otraRaiz = `${ROOT}/scripts/..`;

  it('lanza specs sin empaquetar cuando no se registraron y calcularSpecsEmpaquetados no los habilita', async () => {
    expect(() => getBundledSpecs(otraRaiz)).toThrow('specs sin empaquetar');
    await calcularSpecsEmpaquetados(otraRaiz);
    expect(() => getBundledSpecs(otraRaiz)).toThrow('specs sin empaquetar');
  });
});
