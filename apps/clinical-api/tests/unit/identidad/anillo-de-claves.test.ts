import { describe, expect, it } from 'vitest';
import { crearAnilloDeClaves } from '../../../src/infrastructure/crypto/anillo-de-claves.js';
import { claveDeTest } from '../../support/identidad.js';

describe('AnilloDeClaves', () => {
  it('entrega la clave de cada versión configurada y undefined para las demás', () => {
    const anillo = crearAnilloDeClaves({
      versionActiva: 2,
      claves: new Map([
        [1, claveDeTest('v1')],
        [2, claveDeTest('v2')],
      ]),
    });

    expect(anillo.versionActiva).toBe(2);
    expect(anillo.claveDe(1)?.equals(claveDeTest('v1'))).toBe(true);
    expect(anillo.claveDe(3)).toBeUndefined();
  });

  it('rechaza el anillo cuando falta la clave de la versión activa sin mostrar material de clave', () => {
    const construir = () =>
      crearAnilloDeClaves({ versionActiva: 2, claves: new Map([[1, claveDeTest('v1')]]) });

    expect(construir).toThrow('versión activa');
  });

  it('rechaza una clave que no mide 32 bytes', () => {
    const construir = () =>
      crearAnilloDeClaves({ versionActiva: 1, claves: new Map([[1, Buffer.alloc(16)]]) });

    expect(construir).toThrow('32 bytes');
  });
});
