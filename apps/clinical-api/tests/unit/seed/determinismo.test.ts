import { describe, expect, it } from 'vitest';
import { idSembrado, relojDelSeed, uuidV5 } from '../../../prisma/seed/determinismo.js';

const NAMESPACE_DNS_DEL_RFC_4122 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('uuidV5', () => {
  it('reproduce el vector de prueba del RFC 4122 cuando se usa el namespace DNS', () => {
    expect(uuidV5(NAMESPACE_DNS_DEL_RFC_4122, 'www.example.com')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });
});

describe('idSembrado', () => {
  it('devuelve el mismo UUID cuando la clave natural es la misma', () => {
    expect(idSembrado('paciente-a')).toBe(idSembrado('paciente-a'));
  });

  it('devuelve UUID distintos cuando la clave natural cambia', () => {
    expect(idSembrado('paciente-a')).not.toBe(idSembrado('paciente-b'));
  });

  it('devuelve un UUID versión 5 con variante RFC 4122', () => {
    expect(idSembrado('paciente-a/diagnostico-1')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('relojDelSeed', () => {
  it('devuelve siempre el mediodía UTC de la fecha de referencia', () => {
    const reloj = relojDelSeed('2026-10-16');

    expect(reloj.now().toISOString()).toBe('2026-10-16T12:00:00.000Z');
    expect(reloj.now().toISOString()).toBe('2026-10-16T12:00:00.000Z');
  });
});
