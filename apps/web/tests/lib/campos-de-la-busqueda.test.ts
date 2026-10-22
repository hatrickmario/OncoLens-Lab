import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { CAMPOS_DE_LA_BUSQUEDA } from '../../lib/server/patients';

describe('CAMPOS_DE_LA_BUSQUEDA del BFF', () => {
  it('coincide con las propiedades de PatientSearchRequest cuando se lee el openapi.yaml de clinical-api [US-048 AC-3]', () => {
    const ruta = new URL('../../../clinical-api/openapi.yaml', import.meta.url);
    const spec = YAML.parse(readFileSync(ruta, 'utf8')) as {
      components: { schemas: { PatientSearchRequest: { properties: Record<string, unknown> } } };
    };

    expect([...CAMPOS_DE_LA_BUSQUEDA].sort()).toEqual(
      Object.keys(spec.components.schemas.PatientSearchRequest.properties).sort(),
    );
  });
});
