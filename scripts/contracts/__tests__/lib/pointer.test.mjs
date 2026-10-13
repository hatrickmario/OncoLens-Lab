import { describe, expect, it } from 'vitest';
import { pointerOf, resolvePointer, segmentsOf } from '../../lib/pointer.mjs';

describe('pointer', () => {
  it('atraviesa el $ref del camino cuando resuelve una respuesta compartida', () => {
    const doc = {
      paths: { '/x': { get: { responses: { 401: { $ref: '#/components/responses/R' } } } } },
      components: { responses: { R: { description: 'no autenticado' } } },
    };
    expect(resolvePointer(doc, '#/paths/~1x/get/responses/401')).toEqual({
      node: { description: 'no autenticado' },
      pointer: '#/components/responses/R',
    });
  });

  it('devuelve los segmentos sin escapar cuando descompone un puntero', () => {
    expect(segmentsOf('#/paths/~1rag~1query/post')).toEqual(['paths', '/rag/query', 'post']);
  });

  it('escapa las barras de una ruta HTTP cuando construye un puntero', () => {
    expect(pointerOf('paths', '/platform/patients/{patientId}', 'get')).toBe('#/paths/~1platform~1patients~1{patientId}/get');
  });
});
