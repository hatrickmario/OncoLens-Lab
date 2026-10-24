import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { RUTA_DEL_CATALOGO } from '../../support/seed.js';

/** Estructura v1 del catálogo clínico (ADR-29, D5 de l1d-171): datos, no código; cada archivo valida contra su esquema. */
const ARCHIVOS_POR_TIPO = [
  'codigos',
  'sinonimos',
  'tendencias',
  'datos-criticos',
  'aplicabilidad',
  'plantillas',
] as const;

const leerJson = (ruta: string): unknown =>
  JSON.parse(readFileSync(join(RUTA_DEL_CATALOGO, ruta), 'utf8'));

function validador(nombreDelEsquema: string) {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  return ajv.compile(leerJson(`schemas/${nombreDelEsquema}.schema.json`) as object);
}

const manifiesto = leerJson('manifest.json') as { cancerTypes: string[] };

describe('catálogo clínico v1', () => {
  it('declara un manifest.json válido contra su esquema [US-041 AC-1]', () => {
    const validar = validador('manifest');

    expect(validar(manifiesto), JSON.stringify(validar.errors)).toBe(true);
  });

  it('incluye los seis archivos por tipo habilitado, cada uno válido contra su esquema [US-041 AC-1]', () => {
    expect(manifiesto.cancerTypes).toEqual(['mama', 'prostata']);

    for (const tipo of manifiesto.cancerTypes) {
      for (const archivo of ARCHIVOS_POR_TIPO) {
        const validar = validador(archivo);
        const contenido = leerJson(`${tipo}/${archivo}.json`);

        expect(
          validar(contenido),
          `${tipo}/${archivo}.json ${JSON.stringify(validar.errors)}`,
        ).toBe(true);
      }
    }
  });

  it('deja tendencias.json en estado propuesta y sin umbrales hasta DEC-08 [US-041 AC-1]', () => {
    for (const tipo of manifiesto.cancerTypes) {
      expect(leerJson(`${tipo}/tendencias.json`)).toEqual({
        version: '1.1.0',
        estado: 'propuesta',
        items: [],
      });
    }
  });

  it('rechaza un archivo que no cumple su esquema (la regla sigue detectando) [US-041 AC-1]', () => {
    const validar = validador('tendencias');

    expect(validar({ version: '1.0.0', estado: 'aprobada-sin-revisar', items: [] })).toBe(false);
    expect(validar({ version: '1.0', estado: 'propuesta', items: [] })).toBe(false);
    expect(validar({ version: '1.0.0', estado: 'propuesta' })).toBe(false);
  });
});
