import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { leerEsquemas } from '../../../packages/clinical-catalogs/validator/index.mjs';
import { CATALOGO } from './apoyo.mjs';

/**
 * Definición única de la marca `revision_provisional` (S7.4b, design D9): la crea la parte A y la referencian por
 * `$ref` los esquemas de aplicabilidad, de reglas de población y de sinónimos. Aquí solo se prueba la definición.
 */
const esquemas = leerEsquemas(path.join(CATALOGO, 'schemas'), (ruta) => readFileSync(ruta, 'utf8'));

/** El validador de la definición, o uno que siempre rechaza si aún no existe (el test falla en la aserción). */
function compilarLaDefinicion() {
  const ajv = new Ajv2020({ strict: true });
  ajv.addSchema(esquemas.comun);
  return ajv.getSchema('comun.schema.json#/$defs/revisionProvisional') ?? (() => false);
}

describe('comun.schema.json#/$defs/revisionProvisional', () => {
  it('declara rol con el único valor ia y fecha ISO cuando se lee la definición', () => {
    const definicion = esquemas.comun.$defs.revisionProvisional;

    expect(definicion?.properties?.rol?.enum).toEqual(['ia']);
    expect(definicion?.additionalProperties).toBe(false);
    expect(definicion?.required).toEqual(['rol', 'fecha']);
  });

  it('acepta un bloque con rol ia y fecha ISO [US-121 AC-1]', () => {
    const validar = compilarLaDefinicion();

    expect(validar({ rol: 'ia', fecha: '2026-11-21' })).toBe(true);
  });

  it('rechaza un rol desconocido', () => {
    const validar = compilarLaDefinicion();

    expect(validar({ rol: 'oncologo', fecha: '2026-11-21' })).toBe(false);
    expect(validar({ rol: 'IA', fecha: '2026-11-21' })).toBe(false);
  });

  it('rechaza una fecha que no es ISO, un bloque incompleto y un campo extra', () => {
    const validar = compilarLaDefinicion();

    expect(validar({ rol: 'ia', fecha: '21/11/2026' })).toBe(false);
    expect(validar({ rol: 'ia' })).toBe(false);
    expect(validar({ fecha: '2026-11-21' })).toBe(false);
    expect(validar({ rol: 'ia', fecha: '2026-11-21', nombre: 'x' })).toBe(false);
  });
});
