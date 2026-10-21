import { describe, expect, it } from 'vitest';
import { readPort } from '../../src/config/index.js';

describe('readPort', () => {
  it('devuelve el puerto por defecto cuando PORT no está definido', () => {
    expect(readPort({})).toBe(3000);
  });

  it('devuelve el puerto de PORT cuando es un puerto TCP válido', () => {
    expect(readPort({ PORT: '8080' })).toBe(8080);
  });

  it('lanza nombrando PORT cuando el valor no es un puerto TCP válido', () => {
    expect(() => readPort({ PORT: 'abc' })).toThrow('PORT');
    expect(() => readPort({ PORT: '70000' })).toThrow('PORT');
  });

  it.each(['0x50', '1e3', ' 80 ', '+80', '8.0', '-1'])(
    'lanza nombrando PORT cuando el valor %s no es una cadena de dígitos',
    (valor) => {
      expect(() => readPort({ PORT: valor })).toThrow('PORT');
    },
  );
});
