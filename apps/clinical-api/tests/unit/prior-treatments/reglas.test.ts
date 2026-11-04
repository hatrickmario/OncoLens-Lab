import { describe, expect, it } from 'vitest';
import {
  campoIncoherenteDelFin,
  motivoDeFinPersistido,
} from '../../../src/modules/prior-treatments/prior-treatments.reglas.js';

describe('campoIncoherenteDelFin', () => {
  it('no señala nada cuando el tratamiento sigue en curso sin fin ni motivo', () => {
    expect(campoIncoherenteDelFin({ ongoing: true, startedAt: '2026-08-01' })).toBeUndefined();
  });

  it('señala endedAt cuando un tratamiento en curso trae fecha de fin', () => {
    expect(campoIncoherenteDelFin({ ongoing: true, endedAt: '2026-09-01' })).toBe('endedAt');
  });

  it('señala endReason cuando un tratamiento en curso trae motivo de fin', () => {
    expect(campoIncoherenteDelFin({ ongoing: true, endReason: 'otro' })).toBe('endReason');
  });

  it('señala endReason cuando un tratamiento terminado no trae motivo', () => {
    expect(campoIncoherenteDelFin({ ongoing: false })).toBe('endReason');
  });

  it('señala endedAt cuando termina antes de empezar', () => {
    expect(
      campoIncoherenteDelFin({
        ongoing: false,
        endReason: 'completado',
        startedAt: '2026-09-01',
        endedAt: '2026-08-01',
      }),
    ).toBe('endedAt');
  });

  it('acepta un tratamiento terminado el mismo día en que empezó', () => {
    expect(
      campoIncoherenteDelFin({
        ongoing: false,
        endReason: 'toxicidad',
        startedAt: '2026-08-01',
        endedAt: '2026-08-01',
      }),
    ).toBeUndefined();
  });
});

describe('motivoDeFinPersistido', () => {
  it('guarda desconocido cuando no hay motivo de fin', () => {
    expect(motivoDeFinPersistido({})).toBe('desconocido');
  });

  it('guarda el motivo enviado cuando existe', () => {
    expect(motivoDeFinPersistido({ endReason: 'progresion' })).toBe('progresion');
  });
});
