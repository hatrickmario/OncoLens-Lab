import { describe, expect, it } from 'vitest';
import { crearGeneradorDeToken } from '../../src/infrastructure/token.js';

describe('crearGeneradorDeToken', () => {
  it('genera 43 caracteres del alfabeto base64url (256 bits) por token', () => {
    expect(crearGeneradorDeToken().nuevo()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('genera tokens distintos en llamadas sucesivas', () => {
    const generador = crearGeneradorDeToken();

    expect(generador.nuevo()).not.toBe(generador.nuevo());
  });
});
