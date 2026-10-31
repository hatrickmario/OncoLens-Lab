import { describe, expect, it } from 'vitest';
import { hrefDeFicha } from '../../lib/ficha/anclas';

const ID = '0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10';

describe('hrefDeFicha', () => {
  it('apunta al encabezado de la ficha cuando no hay ancla', () => {
    expect(hrefDeFicha(ID)).toBe(`/pacientes/${ID}`);
  });

  it('añade el ancla permitida cuando se indica', () => {
    expect(hrefDeFicha(ID, 'biomarcadores')).toBe(`/pacientes/${ID}#biomarcadores`);
    expect(hrefDeFicha(ID, 'diagnostico')).toBe(`/pacientes/${ID}#diagnostico`);
  });

  it('lanza un error cuando el identificador no es un UUID y no arma la ruta', () => {
    expect(() => hrefDeFicha('../otra')).toThrow(/UUID/);
    expect(() => hrefDeFicha('p-1')).toThrow(/UUID/);
  });
});
