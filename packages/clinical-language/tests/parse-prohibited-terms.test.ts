import { describe, expect, it } from 'vitest';
import { loadProhibitedTerms, parseProhibitedTerms } from '../src/index.js';

const origen = 'lista-de-prueba.json';
const valida = () => structuredClone(loadProhibitedTerms());

describe('parseProhibitedTerms', () => {
  it('devuelve la lista cuando cumple el esquema', () => {
    expect(parseProhibitedTerms(valida(), origen).version).toBe('1.2.0');
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

  it('lanza un error cuando la versión no es semver', () => {
    const lista = { ...valida(), version: 'uno' };

    expect(() => parseProhibitedTerms(lista, origen)).toThrow(/semver/);
  });
});
