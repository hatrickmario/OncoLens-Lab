import { describe, expect, it } from 'vitest';
import { checkProhibitedTerms } from '../src/index.js';
import type { ListaTerminos } from '../src/index.js';

// Lista mínima y sintética: el verificador es puro y se prueba sin leer el catálogo real.
const lista: ListaTerminos = {
  version: '0.0.1',
  normalizacion: 'prueba',
  nivelA: {
    aplicaA: ['ui'],
    terminos: [
      { id: 'es-debe-recibir', idioma: 'es', texto: 'debe recibir' },
      { id: 'es-no-debe-recibir', idioma: 'es', texto: 'no debe recibir' },
      {
        id: 'es-administre',
        idioma: 'es',
        texto: 'administre',
        formas: ['administre', 'administrelo'],
      },
      { id: 'es-se-debe', idioma: 'es', texto: 'se debe', excepciones: ['se debe a'] },
      { id: 'en-should-receive', idioma: 'en', texto: 'should receive' },
      { id: 'es-deben-recibir', idioma: 'es', texto: 'deben recibir' },
    ],
  },
  nivelB: {
    aplicaA: ['ui'],
    prefijos: [{ id: 'b-recomend', idioma: 'es', prefijo: 'recomend' }],
    terminos: [
      { id: 'b-es-iniciar', idioma: 'es', texto: 'iniciar' },
      { id: 'b-en-switch-to', idioma: 'en', texto: 'switch to' },
    ],
  },
  frasesPermitidas: {
    aplicaA: ['ui'],
    frases: ['iniciar sesión', 'no constituye una recomendación'],
  },
};

const ids = (texto: string, opciones?: Parameters<typeof checkProhibitedTerms>[2]) =>
  checkProhibitedTerms(texto, lista, opciones).map((c) => c.id);

describe('checkProhibitedTerms (lógica pura)', () => {
  it('devuelve cero coincidencias cuando el texto está vacío', () => {
    expect(ids('')).toEqual([]);
  });

  it('devuelve una coincidencia con el id, el término y el nivel cuando aparece el término exacto', () => {
    expect(checkProhibitedTerms('debe recibir', lista)).toEqual([
      { id: 'es-debe-recibir', termino: 'debe recibir', nivel: 'A' },
    ]);
  });

  it('devuelve una sola coincidencia cuando dos términos tienen la misma clave, con el id del que iguala el texto', () => {
    expect(ids('deben recibir')).toEqual(['es-deben-recibir']);
    expect(ids('debe recibirlo')).toEqual(['es-debe-recibir']);
  });

  it('devuelve una coincidencia por cada aparición cuando el término se repite', () => {
    expect(ids('debe recibir A y debe recibir B')).toEqual(['es-debe-recibir', 'es-debe-recibir']);
  });

  it('devuelve solo las formas cuando el término declara formas', () => {
    expect(ids('administre trastuzumab')).toEqual(['es-administre']);
    expect(ids('Adminístrelo hoy')).toEqual(['es-administre']);
    expect(ids('se administra cada 3 semanas')).toEqual([]);
  });

  it('anula el término cuando una excepción lo contiene', () => {
    expect(ids('se debe a la toxicidad')).toEqual([]);
    expect(ids('se debe suspender')).toEqual(['es-se-debe']);
  });

  it('informa solo el tramo más largo cuando dos términos se solapan', () => {
    expect(ids('no debe recibir')).toEqual(['es-no-debe-recibir']);
  });

  it('ignora el Nivel B cuando solo se pide el Nivel A', () => {
    expect(ids('Iniciar tratamiento')).toEqual([]);
    expect(ids('Iniciar tratamiento', { niveles: ['A', 'B'] })).toEqual(['b-es-iniciar']);
  });

  it('aplica el prefijo del Nivel B a cualquier palabra que empiece por él', () => {
    expect(ids('recomendaciones', { niveles: ['A', 'B'] })).toEqual(['b-recomend']);
  });

  it('encuentra un término de Nivel B de dos palabras', () => {
    expect(ids('Switch to pertuzumab', { niveles: ['A', 'B'] })).toEqual(['b-en-switch-to']);
  });

  it('descarta la frase permitida solo cuando se pide permitirFrases', () => {
    const niveles = ['A', 'B'] as const;
    expect(ids('Iniciar sesión', { niveles, permitirFrases: true })).toEqual([]);
    expect(ids('Iniciar sesión', { niveles })).toEqual(['b-es-iniciar']);
  });

  it('no une las palabras vecinas cuando una frase permitida se descarta', () => {
    const opciones = { niveles: ['A', 'B'], permitirFrases: true } as const;
    expect(ids('debe iniciar sesión recibir', opciones)).toEqual([]);
  });

  it('devuelve una coincidencia cuando el término está en inglés', () => {
    expect(ids('She should receive it')).toEqual(['en-should-receive']);
  });
});
