import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { leerContrasenaDe, sinSaltoFinal } from '../../src/cli/leer-contrasena.js';

describe('sinSaltoFinal', () => {
  it.each([
    ['clave\n', 'clave'],
    ['clave\r\n', 'clave'],
    ['clave', 'clave'],
    ['  con espacios  \n', '  con espacios  '],
  ])('quita solo el salto de línea final de %j', (entrada, esperado) => {
    expect(sinSaltoFinal(entrada)).toBe(esperado);
  });
});

describe('leerContrasenaDe', () => {
  it('lee toda la entrada estándar cuando no es una terminal', async () => {
    const entrada = Readable.from([Buffer.from('parte-uno'), Buffer.from('-parte-dos\n')]);

    expect(await leerContrasenaDe(entrada, () => undefined)).toBe('parte-uno-parte-dos');
  });
});
