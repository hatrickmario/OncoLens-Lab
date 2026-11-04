import { describe, expect, it } from 'vitest';
import {
  ANCLAS_DE_CASO,
  anclaPermitida,
  hrefDeFicha,
  hrefDeVistaDeCaso,
} from '../../lib/ficha/anclas';

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

describe('hrefDeVistaDeCaso', () => {
  it('apunta a la vista de caso con y sin ancla permitida', () => {
    expect(hrefDeVistaDeCaso(ID)).toBe(`/pacientes/${ID}/caso`);
    expect(hrefDeVistaDeCaso(ID, 'datos-criticos')).toBe(`/pacientes/${ID}/caso#datos-criticos`);
  });

  it('lanza un error cuando el identificador no es un UUID', () => {
    expect(() => hrefDeVistaDeCaso('../otra', 'datos-criticos')).toThrow(/UUID/);
  });
});

describe('anclaPermitida con las anclas de la vista de caso', () => {
  it('acepta datos-criticos y rechaza las anclas de la ficha cuando la lista es la de la vista', () => {
    expect(ANCLAS_DE_CASO).toEqual(['datos-criticos']);
    expect(anclaPermitida('#datos-criticos', ANCLAS_DE_CASO)).toBe('datos-criticos');
    expect(anclaPermitida('#diagnostico', ANCLAS_DE_CASO)).toBeNull();
  });
});
