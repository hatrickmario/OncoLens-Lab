import { describe, expect, it } from 'vitest';
import { aplanarMensajes } from '../src/aplanar-mensajes.js';

describe('aplanarMensajes', () => {
  it('une las claves anidadas con puntos cuando el archivo de mensajes tiene objetos dentro de objetos', () => {
    const mensajes = {
      app: { nombre: 'OncoLens' },
      evidence: { orderCriterion: { relevance: 'Relevancia' } },
    };

    expect(aplanarMensajes(mensajes)).toEqual([
      { clave: 'app.nombre', texto: 'OncoLens' },
      { clave: 'evidence.orderCriterion.relevance', texto: 'Relevancia' },
    ]);
  });

  it('ignora lo que no es cadena cuando hay números, nulos o booleanos', () => {
    expect(aplanarMensajes({ a: 1, b: null, c: true, d: 'texto' })).toEqual([
      { clave: 'd', texto: 'texto' },
    ]);
  });

  it('indexa los elementos cuando un mensaje es una lista de cadenas', () => {
    expect(aplanarMensajes({ pasos: ['uno', 'dos'] })).toEqual([
      { clave: 'pasos.0', texto: 'uno' },
      { clave: 'pasos.1', texto: 'dos' },
    ]);
  });
});
