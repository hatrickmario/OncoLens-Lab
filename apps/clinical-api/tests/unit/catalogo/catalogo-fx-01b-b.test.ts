import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import esquemaDeCodigos from '../../../../../packages/clinical-catalogs/schemas/codigos.schema.json' with { type: 'json' };
import esquemaDeSinonimos from '../../../../../packages/clinical-catalogs/schemas/sinonimos.schema.json' with { type: 'json' };
import { exigirCatalogoValido } from '../../../src/infrastructure/catalogo/validar-catalogo.js';
import { RUTA_CATALOGO_FX01BB } from '../../support/catalogo-terminologico.js';

const leerTexto = (ruta: string): string => readFileSync(ruta, 'utf8');
const TIPOS = ['mama', 'prostata'] as const;

describe('catálogo de test FX-01b-b (test-normalizacion-1.0.0)', () => {
  it('pasa el validador del catálogo del paquete cuando se valida entero', () => {
    expect(() => exigirCatalogoValido(RUTA_CATALOGO_FX01BB, leerTexto)).not.toThrow();
  });

  it.each(TIPOS)('cumple codigos.schema.json y sinonimos.schema.json cuando se lee %s', (tipo) => {
    const ajv = new Ajv2020.default({ strict: true });
    const leer = (archivo: string): unknown =>
      JSON.parse(leerTexto(resolve(RUTA_CATALOGO_FX01BB, tipo, archivo)));

    expect(ajv.validate(esquemaDeCodigos, leer('codigos.json'))).toBe(true);
    expect(ajv.validate(esquemaDeSinonimos, leer('sinonimos.json'))).toBe(true);
  });

  it('usa para leuprorelina el código ATC real L02AE02 cuando se lee prostata', () => {
    const { entradas } = JSON.parse(
      leerTexto(resolve(RUTA_CATALOGO_FX01BB, 'prostata/codigos.json')),
    ) as { entradas: { estandar: string; codigo: string }[] };

    expect(entradas.filter((e) => e.estandar === 'atc').map((e) => e.codigo)).toEqual(['L02AE02']);
  });
});
