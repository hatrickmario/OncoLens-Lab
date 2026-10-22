import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { CAMPOS_DE_LA_BUSQUEDA } from '../../../src/modules/patients/patients.schema.js';

const RUTA_DEL_SPEC = resolve(fileURLToPath(new URL('../../../openapi.yaml', import.meta.url)));

describe('CAMPOS_DE_LA_BUSQUEDA', () => {
  it('coincide con las propiedades de PatientSearchRequest cuando se lee openapi.yaml [US-048 AC-3]', () => {
    const spec = YAML.parse(readFileSync(RUTA_DEL_SPEC, 'utf8')) as {
      components: { schemas: { PatientSearchRequest: { properties: Record<string, unknown> } } };
    };

    expect([...CAMPOS_DE_LA_BUSQUEDA].sort()).toEqual(
      Object.keys(spec.components.schemas.PatientSearchRequest.properties).sort(),
    );
  });
});
