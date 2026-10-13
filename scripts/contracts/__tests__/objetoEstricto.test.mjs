import { describe, expect, it } from 'vitest';
import { objetoEstricto } from '../generate.mjs';

/** Contexto mínimo del resolver de objetos de @hey-api/openapi-ts: la cadena `z.<método>(<args>)` se graba como dato. */
const contexto = (schema) => ({
  schema,
  symbols: { z: 'z' },
  $: (base) => ({ attr: (metodo) => ({ call: (...argumentos) => ({ base, metodo, argumentos }) }) }),
  nodes: { shape: () => 'forma' },
});

describe('objetoEstricto', () => {
  it('produce z.strictObject cuando el schema es cerrado y tiene propiedades [US-033 AC-16]', () => {
    const cerrado = { type: 'object', properties: { id: { type: 'string' } }, additionalProperties: { type: 'never' } };
    expect(objetoEstricto(contexto(cerrado))).toEqual({ base: 'z', metodo: 'strictObject', argumentos: ['forma'] });
  });

  it('deja el resolver por defecto cuando el objeto admite propiedades adicionales [US-033 AC-16]', () => {
    const abierto = { type: 'object', properties: { id: { type: 'string' } } };
    expect(objetoEstricto(contexto(abierto))).toBeUndefined();
  });
});
