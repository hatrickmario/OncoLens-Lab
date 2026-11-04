import { describe, expect, it } from 'vitest';
import {
  claveDeItem,
  hrefDeRegistroManual,
  rutaDeLaPagina,
} from '../../lib/registro-manual/enlaces';

const ID = '0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10';

describe('hrefDeRegistroManual', () => {
  it('arma el enlace de la vista de caso con la clave del catálogo', () => {
    expect(hrefDeRegistroManual(ID, 'ki67', 'caso')).toBe(`/pacientes/${ID}/caso?item=ki67`);
  });

  it('arma el enlace de la ficha con la clave del catálogo', () => {
    expect(hrefDeRegistroManual(ID, 'grado', 'ficha')).toBe(`/pacientes/${ID}?item=grado`);
  });

  it('lanza un error cuando el identificador no es un UUID', () => {
    expect(() => hrefDeRegistroManual('../otra', 'ki67', 'caso')).toThrow(/UUID/);
  });

  it('lanza un error cuando la clave no es del catálogo y no arma la ruta', () => {
    expect(() => hrefDeRegistroManual(ID, 'ki67&x=1', 'ficha')).toThrow(/clave/);
    expect(() => hrefDeRegistroManual(ID, '', 'ficha')).toThrow(/clave/);
  });
});

describe('rutaDeLaPagina', () => {
  it('devuelve la página sin item cuando se vuelve de un formulario abierto por URL', () => {
    expect(rutaDeLaPagina(ID, 'caso')).toBe(`/pacientes/${ID}/caso`);
    expect(rutaDeLaPagina(ID, 'ficha')).toBe(`/pacientes/${ID}`);
  });
});

describe('claveDeItem', () => {
  it('devuelve la clave cuando es una clave válida del catálogo', () => {
    expect(claveDeItem('her2_ihq')).toBe('her2_ihq');
  });

  it('devuelve undefined cuando falta, se repite o trae caracteres ajenos', () => {
    expect(claveDeItem(undefined)).toBeUndefined();
    expect(claveDeItem(['ki67', 'grado'])).toBeUndefined();
    expect(claveDeItem('<img src=x>')).toBeUndefined();
    expect(claveDeItem('')).toBeUndefined();
  });
});
