import { describe, expect, it } from 'vitest';
import {
  crearIndiceCiego,
  normalizarNombre,
} from '../../../src/infrastructure/crypto/indice-ciego.js';
import { FX_T4A_A, claveDeTest } from '../../support/identidad.js';

describe('normalizarNombre', () => {
  it('quita las tildes cuando el nombre las trae', () => {
    expect(normalizarNombre(FX_T4A_A.nombreCompleto)).toBe(FX_T4A_A.nombreNormalizado);
  });

  it('pasa a minúsculas cuando el nombre viene en mayúsculas', () => {
    expect(normalizarNombre('LUCIA FERNANDA RONDON PEÑA')).toBe(FX_T4A_A.nombreNormalizado);
  });

  it('colapsa los espacios internos y quita los de borde', () => {
    expect(normalizarNombre('  Lucía   Fernanda\tRondón \n Peña ')).toBe(
      FX_T4A_A.nombreNormalizado,
    );
  });

  it('trata igual la ñ compuesta y la descompuesta', () => {
    expect(normalizarNombre('Peña')).toBe(normalizarNombre('Peña'));
  });

  it('devuelve cadena vacía cuando el nombre solo tiene espacios', () => {
    expect(normalizarNombre('  \t ')).toBe('');
  });
});

describe('IndiceCiego del nombre', () => {
  const indice = crearIndiceCiego(claveDeTest('hmac'));

  it('calcula el mismo índice cuando el nombre difiere solo en tildes, mayúsculas y espacios [US-048 AC-3]', () => {
    expect(indice.indiceDeNombre('LUCIA  fernanda rondon PEÑA')).toBe(
      indice.indiceDeNombre(FX_T4A_A.nombreCompleto),
    );
  });

  it('calcula otro índice cuando el nombre está incompleto', () => {
    expect(indice.indiceDeNombre(FX_T4A_A.apellido)).not.toBe(
      indice.indiceDeNombre(FX_T4A_A.nombreCompleto),
    );
  });

  it('no contiene el nombre ni la forma normalizada y es un hex de 64 caracteres', () => {
    const valor = indice.indiceDeNombre(FX_T4A_A.nombreCompleto);

    expect(valor).toMatch(/^[0-9a-f]{64}$/);
    expect(valor).not.toContain(FX_T4A_A.nombreNormalizado);
  });

  it('separa el dominio del documento: el mismo texto da otro índice como nombre que como documento', () => {
    expect(indice.indiceDeNombre('sintetico')).not.toBe(
      indice.indiceDeDocumento('sintetico', 'sintetico'),
    );
  });
});
