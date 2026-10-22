import { describe, expect, it } from 'vitest';
import {
  enmascararDocumento,
  enmascararNombre,
} from '../../../src/modules/patients/patients.reglas.js';

const MARCADOR = '••••';

describe('enmascararNombre', () => {
  it('devuelve las iniciales en mayúscula con punto cuando el nombre tiene cuatro palabras', () => {
    expect(enmascararNombre('Lucía Fernanda Rondón Peña')).toBe('L. F. R. P.');
  });

  it('pasa a mayúscula la inicial cuando la palabra empieza en minúscula', () => {
    expect(enmascararNombre('ana de la cruz')).toBe('A. D. L. C.');
  });

  it('ignora los espacios de borde y los repetidos cuando el nombre los trae', () => {
    expect(enmascararNombre('  Prueba   Sintética  1 ')).toBe('P. S. 1.');
  });

  it('conserva la inicial completa cuando empieza con un carácter fuera del plano básico', () => {
    expect(enmascararNombre('\u{1D4D0}na')).toBe('\u{1D4D0}.');
  });

  it('devuelve cadena vacía cuando el nombre está vacío', () => {
    expect(enmascararNombre('   ')).toBe('');
  });
});

describe('enmascararDocumento', () => {
  it('muestra los dos últimos caracteres cuando el documento es numérico', () => {
    expect(enmascararDocumento(['123', '4567'].join(''))).toBe(`${MARCADOR} 67`);
  });

  it('muestra los dos últimos caracteres del documento sintético cuando lleva prefijo y guion', () => {
    expect(enmascararDocumento('SINT-0000001')).toBe(`${MARCADOR} 01`);
  });

  it('da la misma longitud cuando el documento es corto o largo', () => {
    expect(enmascararDocumento('SINT-0000001')).toHaveLength(enmascararDocumento('98765').length);
  });

  it('ignora los puntos y espacios cuando el documento los trae', () => {
    expect(enmascararDocumento([['1', '234', '567'].join('.'), ' '].join(''))).toBe(
      `${MARCADOR} 67`,
    );
  });

  it('pasa a mayúscula los caracteres visibles cuando el documento es alfanumérico en minúscula', () => {
    expect(enmascararDocumento('ab12cd')).toBe(`${MARCADOR} CD`);
  });

  it('rellena a la izquierda cuando el documento tiene un solo carácter', () => {
    expect(enmascararDocumento('7')).toBe(`${MARCADOR} 07`);
  });

  it('nunca contiene más de dos caracteres del documento', () => {
    expect(enmascararDocumento('ABCDEFGH')).not.toContain('ABCD');
  });
});
