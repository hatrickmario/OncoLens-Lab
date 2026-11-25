import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RELACIONES_DE_SINONIMO } from '../../../src/infrastructure/catalogo/catalogo-terminologico.js';
import { RUTA_CATALOGO_REAL } from '../../support/catalogo-terminologico.js';

describe('relaciones de sinonimos.json', () => {
  it('el lector tiene las mismas relaciones que el enum del esquema del catálogo [US-277 AC-1]', () => {
    const esquema = JSON.parse(
      readFileSync(path.join(RUTA_CATALOGO_REAL, 'schemas/sinonimos.schema.json'), 'utf8'),
    );
    const relacion = esquema.properties.items.items.properties.sinonimos.items.properties.relacion;

    expect([...(RELACIONES_DE_SINONIMO ?? [])].sort()).toEqual([...relacion.enum].sort());
  });
});
