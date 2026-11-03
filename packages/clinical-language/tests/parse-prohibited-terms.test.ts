import { describe, expect, it } from 'vitest';
import { loadProhibitedTerms, parseProhibitedTerms } from '../src/index.js';

const origen = 'lista-de-prueba.json';
const valida = () => structuredClone(loadProhibitedTerms());

describe('parseProhibitedTerms', () => {
  it('devuelve la lista cuando cumple el esquema', () => {
    expect(parseProhibitedTerms(valida(), origen).version).toBe('1.6.0');
  });

  it('lanza un error que nombra el origen cuando hay ids repetidos entre niveles', () => {
    const lista = valida();
    const repetido = lista.nivelA.terminos[0]?.id ?? '';
    lista.nivelB.terminos.push({ id: repetido, idioma: 'es', texto: 'otro texto' });

    expect(() => parseProhibitedTerms(lista, origen)).toThrow(origen);
    expect(() => parseProhibitedTerms(lista, origen)).toThrow(/id repetidos entre niveles/);
  });

  it('lanza un error cuando las formas de un término no incluyen su propio texto', () => {
    const lista = valida();
    const conFormas = lista.nivelA.terminos.find((termino) => termino.formas);
    if (conFormas) conFormas.formas = ['otra forma'];

    expect(() => parseProhibitedTerms(lista, origen)).toThrow(/formas no incluye/);
  });

  it('lanza un error cuando una excepción no contiene el texto del término', () => {
    const lista = valida();
    const conExcepciones = lista.nivelA.terminos.find((termino) => termino.excepciones);
    if (conExcepciones) conExcepciones.excepciones = ['algo distinto'];

    expect(() => parseProhibitedTerms(lista, origen)).toThrow(/no contiene/);
  });

  it('lanza un error cuando el texto de un término queda vacío tras la normalización', () => {
    const lista = valida();
    lista.nivelB.terminos.push({ id: 'b-vacio', idioma: 'es', texto: '¿?' });

    expect(() => parseProhibitedTerms(lista, origen)).toThrow(/normalización/);
  });

  it('lanza un error cuando un prefijo queda vacío tras la normalización', () => {
    const lista = valida();
    lista.nivelB.prefijos.push({ id: 'b-prefijo-vacio', idioma: 'es', prefijo: '...' });

    expect(() => parseProhibitedTerms(lista, origen)).toThrow(/normalización/);
  });

  it('lanza un error cuando la versión no es semver', () => {
    const lista = { ...valida(), version: 'uno' };

    expect(() => parseProhibitedTerms(lista, origen)).toThrow(/semver/);
  });

  it('devuelve salidaGenerada.nivelB con ids que existen en el Nivel B cuando carga la lista vigente [US-249 AC-2]', () => {
    const lista = parseProhibitedTerms(valida(), origen);

    expect(lista.salidaGenerada.nivelB).toEqual(['b-recomend', 'b-recomiend', 'b-recommend']);
  });

  it('lanza un error que nombra el origen y el id cuando salidaGenerada trae un id desconocido [US-249 AC-2]', () => {
    const lista = valida();
    lista.salidaGenerada.nivelB.push('b-no-existe');

    expect(() => parseProhibitedTerms(lista, origen)).toThrow(origen);
    expect(() => parseProhibitedTerms(lista, origen)).toThrow(/b-no-existe/);
  });

  it('lanza un error cuando salidaGenerada falta o queda vacía (falla cerrada) [US-249 AC-2]', () => {
    const sin: Record<string, unknown> = { ...valida() };
    sin['salidaGenerada'] = undefined;
    const vacia = valida();
    vacia.salidaGenerada.nivelB = [];

    expect(() => parseProhibitedTerms(sin, origen)).toThrow(/salidaGenerada/);
    expect(() => parseProhibitedTerms(vacia, origen)).toThrow(/salidaGenerada/);
  });
});
