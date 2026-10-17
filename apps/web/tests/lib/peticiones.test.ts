import { describe, expect, it } from 'vitest';
import { esTipoJson } from '../../lib/server/peticiones';

describe('esTipoJson', () => {
  it.each([
    ['application/json', true],
    ['Application/JSON; charset=utf-8', true],
    ['application/jsonx', false],
    ['text/html', false],
    [null, false],
  ])('con Content-Type %s devuelve %s', (tipo, esperado) => {
    const cabeceras = new Headers(tipo === null ? {} : { 'Content-Type': tipo });

    expect(esTipoJson(cabeceras)).toBe(esperado);
  });
});
