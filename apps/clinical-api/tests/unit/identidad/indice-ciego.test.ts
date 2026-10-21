import { describe, expect, it } from 'vitest';
import {
  crearIndiceCiego,
  normalizarNumeroDeDocumento,
} from '../../../src/infrastructure/crypto/indice-ciego.js';
import { FX_T4A_A, claveDeTest } from '../../support/identidad.js';

describe('normalizarNumeroDeDocumento', () => {
  it('quita puntos, guiones y espacios', () => {
    expect(normalizarNumeroDeDocumento('1.234-567 ')).toBe('1234567');
  });

  it('pasa a mayúsculas el pasaporte con letras', () => {
    expect(normalizarNumeroDeDocumento('ab 12-3')).toBe('AB123');
  });
});

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

  it('calcula el mismo índice cuando el número lleva separadores', () => {
    const indice = crearIndiceCiego(claveDeTest('hmac'));
    const conPuntos = ['1', '234', '567'].join('.');

    expect(indice.indiceDeDocumento(FX_T4A_A.idType, conPuntos)).toBe(
      indice.indiceDeDocumento(FX_T4A_A.idType, FX_T4A_A.numeroDeDocumento),
    );
  });

  it('calcula otro índice cuando cambia el tipo de documento', () => {
    const indice = crearIndiceCiego(claveDeTest('hmac'));

    expect(indice.indiceDeDocumento('pasaporte', FX_T4A_A.numeroDeDocumento)).not.toBe(
      indice.indiceDeDocumento(FX_T4A_A.idType, FX_T4A_A.numeroDeDocumento),
    );
  });

  it('calcula otro índice cuando cambia la clave HMAC', () => {
    const conOtraClave = crearIndiceCiego(claveDeTest('otra-clave-hmac'));
    const conLaClave = crearIndiceCiego(claveDeTest('hmac'));

    expect(conOtraClave.indiceDeDocumento(FX_T4A_A.idType, FX_T4A_A.numeroDeDocumento)).not.toBe(
      conLaClave.indiceDeDocumento(FX_T4A_A.idType, FX_T4A_A.numeroDeDocumento),
    );
  });
});
