import { describe, expect, it } from 'vitest';
import { nuevoSeudonimo, nuevoTraceId } from '../../src/infrastructure/ids.js';

describe('nuevoTraceId', () => {
  it('cumple el patrón TraceId del contrato', () => {
    expect(nuevoTraceId()).toMatch(/^req_[A-Za-z0-9]{8,32}$/);
  });
});

describe('nuevoSeudonimo', () => {
  it('cumple el patrón pseudoPatientId del contrato', () => {
    expect(nuevoSeudonimo()).toMatch(/^psd_[A-Za-z0-9]+$/);
  });

  it('devuelve un valor distinto en cada consulta', () => {
    const seudonimos = new Set(Array.from({ length: 50 }, () => nuevoSeudonimo()));

    expect(seudonimos.size).toBe(50);
  });
});
