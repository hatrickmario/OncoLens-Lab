import { describe, expect, it } from 'vitest';
import { crearIndiceCiego } from '../../../src/infrastructure/crypto/indice-ciego.js';
import { enmascararDocumento } from '../../../src/modules/patients/patients.reglas.js';
import { FX_T4A_A, claveDeTest } from '../../support/identidad.js';

/**
 * Vectores FIJOS de los índices ciegos: cambiar `normalizarNumeroDeDocumento`, `normalizarNombre` o los prefijos
 * invalida todos los HMAC guardados y la búsqueda devolvería vacío sin error (RN-10, US-046/US-048). Si este test
 * falla, no se "actualiza el literal": hay que migrar los índices.
 */
describe('vectores fijos del índice ciego', () => {
  const indice = crearIndiceCiego(claveDeTest('hmac'));

  it('mantiene el índice del documento cuando el número trae puntos [US-048 AC-2]', () => {
    expect(indice.indiceDeDocumento(FX_T4A_A.idType, ['1', '234', '567'].join('.'))).toBe(
      'a2e020620c55d4372e63a93195490de07f3b183542bda35c57c9a0941932b345',
    );
  });

  it('mantiene el índice del nombre completo [US-048 AC-3]', () => {
    expect(indice.indiceDeNombre(FX_T4A_A.nombreCompleto)).toBe(
      '872e32e8d380b689f92669401c4b1c7771590cb06fcf4d1cb9af7c83b31b30dd',
    );
  });
});

describe('enmascararDocumento y el índice', () => {
  it('enmascara igual un documento con y sin separadores sin depender del normalizador del índice', () => {
    expect(enmascararDocumento(['1', '234', '567'].join('.'))).toBe(
      enmascararDocumento(FX_T4A_A.numeroDeDocumento),
    );
  });
});
