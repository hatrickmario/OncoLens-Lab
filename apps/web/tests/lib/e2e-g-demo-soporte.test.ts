import { describe, expect, it } from 'vitest';
import { estadoDelOrden, opcionDelRotulo, violacionesDeOrdenRn28 } from '../../e2e/orden-rn28';
import { modoDelLlm, plazosDelGate } from '../../e2e/resultado-del-gate';

const comparable = (coincide: number) => ({ coincide, noComparable: false });
const noComparable = (coincide: number) => ({ coincide, noComparable: true });

describe('Orden RN-28 desde los conteos visibles del E2E del gate [US-142 AC-1]', () => {
  it('detecta la inversión cuando una opción no comparable precede a una comparable', () => {
    expect(violacionesDeOrdenRn28([noComparable(0), comparable(2)])).toHaveLength(1);
    expect(estadoDelOrden([noComparable(0), comparable(2)])).toBe('fallo');
  });

  it('detecta la inversión cuando una comparable con menos Coincide precede a otra con más', () => {
    expect(violacionesDeOrdenRn28([comparable(1), comparable(3)])).toHaveLength(1);
  });

  it('acepta comparables con Coincide no crecientes y una no comparable al final', () => {
    expect(estadoDelOrden([comparable(2), comparable(2), noComparable(0)])).toBe('ok');
  });

  it('declara no_verificable y no ok cuando hay menos de 2 opciones visibles', () => {
    expect(estadoDelOrden([])).toBe('no_verificable');
    expect(estadoDelOrden([comparable(1)])).toBe('no_verificable');
  });

  it('lee los Coincide del rótulo sin confundirlos con No coincide', () => {
    const rotulo = 'Coincide 2, Parcial 1, No coincide 3, Desconocido 0';

    expect(opcionDelRotulo(rotulo, false)).toEqual({ coincide: 2, noComparable: false });
  });

  it('lanza con el rótulo cuando no se puede leer, nunca devuelve NaN', () => {
    expect(() => opcionDelRotulo('conteos no disponibles', false)).toThrow(
      /rótulo de aplicabilidad ilegible: «conteos no disponibles»/,
    );
  });
});

describe('Modo del LLM del resultado del gate', () => {
  it.each([
    ['fake', 'fingido'],
    ['fingido', 'fingido'],
    ['local', 'real'],
    [undefined, 'desconocido'],
    ['openai', 'desconocido'],
  ])('mapea %s a %s', (proveedor, esperado) => {
    expect(modoDelLlm(proveedor)).toBe(esperado);
  });
});

describe('Plazos del recorrido del gate por modo del LLM (D5-57)', () => {
  it('mantiene los plazos del LLM fingido cuando el modo es fingido', () => {
    expect(plazosDelGate('fingido')).toEqual({ recorrido: 180_000, generacion: 5_000 });
  });

  it('da a la generación un plazo mayor que el recorrido típico de 55 s cuando el modo es real', () => {
    const real = plazosDelGate('real');

    expect(real.generacion).toBeGreaterThan(55_000);
    expect(real.recorrido).toBeGreaterThan(real.generacion * 2);
  });

  it('usa los plazos estrictos del fingido cuando el modo es desconocido', () => {
    expect(plazosDelGate('desconocido')).toEqual(plazosDelGate('fingido'));
  });
});
