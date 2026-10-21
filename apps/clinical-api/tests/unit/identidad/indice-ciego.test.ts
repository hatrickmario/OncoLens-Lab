import { describe, expect, it } from 'vitest';
import { crearIndiceCiego } from '../../../src/infrastructure/crypto/indice-ciego.js';
import { FX_T4A_A, claveDeTest } from '../../support/identidad.js';

describe('IndiceCiego', () => {
  it('calcula el mismo índice para el mismo documento, otro para un número distinto y ninguno contiene el número [US-046 AC-2]', () => {
    const indice = crearIndiceCiego(claveDeTest('hmac'));

    const primero = indice.indiceDeDocumento(FX_T4A_A.idType, FX_T4A_A.numeroDeDocumento);
    const segundo = indice.indiceDeDocumento(FX_T4A_A.idType, FX_T4A_A.numeroDeDocumento);
    const distinto = indice.indiceDeDocumento(FX_T4A_A.idType, FX_T4A_A.numeroDistinto);

    expect(segundo).toBe(primero);
    expect(distinto).not.toBe(primero);
    for (const valor of [primero, segundo, distinto]) {
      expect(valor).not.toContain(FX_T4A_A.numeroDeDocumento);
      expect(valor).not.toContain(FX_T4A_A.numeroDistinto);
    }
  });
});
