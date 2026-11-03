import { describe, expect, it } from 'vitest';
import { fechaRelativa } from '../../lib/fechas/fecha-relativa';

const HOY = '2026-10-01';

describe('fechaRelativa', () => {
  it.each([
    ['2026-10-01', 'hoy'],
    ['2026-09-30', 'hace 1 día'],
    ['2026-09-19', 'hace 12 días'],
    ['2026-09-01', 'hace 30 días'],
    ['2026-08-31', 'hace 1 mes'],
    ['2025-10-05', 'hace 11 meses'],
    ['2024-10-02', 'hace 23 meses'],
    ['2024-10-01', 'hace 2 años'],
    ['2022-09-30', 'hace 4 años'],
  ])('muestra %s como «%s» cuando hoy es 2026-10-01', (fecha, esperado) => {
    expect(fechaRelativa(fecha, HOY)).toBe(esperado);
  });

  it('muestra la fecha absoluta cuando es futura', () => {
    expect(fechaRelativa('2026-10-02', HOY)).toBe('02/10/2026');
  });

  it('devuelve el valor tal cual cuando no tiene forma de fecha', () => {
    expect(fechaRelativa('no-es-fecha', HOY)).toBe('no-es-fecha');
  });
});
