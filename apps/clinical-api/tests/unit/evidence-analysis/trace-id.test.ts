import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  crearTraceIdMiddleware,
  traceIdEntranteRegistrable,
} from '../../../src/modules/evidence-analysis/trace-id.middleware.js';

describe('traceIdEntranteRegistrable', () => {
  it('devuelve el valor cuando cumple el patrón req_ + 8 a 32 alfanuméricos', () => {
    expect(traceIdEntranteRegistrable('req_Entrante01')).toBe('req_Entrante01');
    expect(traceIdEntranteRegistrable(`req_${'a'.repeat(32)}`)).toBe(`req_${'a'.repeat(32)}`);
  });

  it('descarta el valor cuando contiene PII sembrada', () => {
    expect(traceIdEntranteRegistrable('Lucía Rondón 52123456')).toBeUndefined();
  });

  it.each([
    ['más corto que 8', 'req_corto'],
    ['más largo que 32', `req_${'a'.repeat(33)}`],
    ['con salto de línea final', 'req_Entrante01\n'],
    ['con prefijo ajeno', 'xreq_Entrante01'],
    ['con separadores', 'req_Entrante-01'],
  ])('descarta el valor cuando es %s', (_caso, valor) => {
    expect(traceIdEntranteRegistrable(valor)).toBeUndefined();
  });

  it('devuelve undefined cuando la cabecera no viene', () => {
    expect(traceIdEntranteRegistrable(undefined)).toBeUndefined();
  });
});

describe('crearTraceIdMiddleware', () => {
  function ejecutar(cabecera: string | undefined) {
    const respuesta = { locals: {} as Response['locals'] };
    const siguiente = vi.fn();
    const peticion = { header: () => cabecera } as unknown as Request;
    crearTraceIdMiddleware({ traceId: () => 'req_Generado01' })(
      peticion,
      respuesta as Response,
      siguiente,
    );
    return { locals: respuesta.locals, siguiente };
  }

  it('guarda el traceId generado y el entrante registrable, y sigue la cadena', () => {
    const { locals, siguiente } = ejecutar('req_Entrante01');

    expect(locals).toEqual({ traceId: 'req_Generado01', traceIdEntrante: 'req_Entrante01' });
    expect(siguiente).toHaveBeenCalledOnce();
  });

  it('no guarda traceIdEntrante cuando el entrante no cumple el patrón', () => {
    const { locals } = ejecutar('Lucía Rondón 52123456');

    expect(locals).toEqual({ traceId: 'req_Generado01' });
    expect(Object.hasOwn(locals, 'traceIdEntrante')).toBe(false);
  });
});
