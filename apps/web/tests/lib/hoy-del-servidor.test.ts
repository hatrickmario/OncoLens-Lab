import { afterEach, describe, expect, it } from 'vitest';
import { hoyDelServidor } from '../../lib/server/hoy';

const ZONA_ORIGINAL = process.env.TZ;

describe('hoyDelServidor', () => {
  afterEach(() => {
    if (ZONA_ORIGINAL === undefined) delete process.env.TZ;
    else process.env.TZ = ZONA_ORIGINAL;
  });

  it('devuelve el día UTC del reloj inyectado aunque la zona del proceso sea otra (igual que clinical-api)', () => {
    process.env.TZ = 'America/Bogota';
    const ahora = () => Date.parse('2026-10-02T03:00:00Z');

    expect(hoyDelServidor({ ahora })).toBe('2026-10-02');
  });
});
