import { describe, expect, it } from 'vitest';
import { medirFaltantes } from '../../../scripts/chat-preparar/metricas-faltantes.js';

const esperados = [
  { item: 'ki67', gap_type: 'no_buscado' },
  { item: 're', gap_type: 'incompleto' },
] as const;

describe('medirFaltantes (M-04.1, M-04.2 y exactitud de gapType)', () => {
  it('devuelve todo en 1 cuando el checklist reporta exactamente los faltantes sembrados con su tipo', () => {
    const enviados = [
      { item: 'ki67', status: 'faltante', gapType: 'no_buscado' },
      { item: 're', status: 'presente_sin_verificar', gapType: 'incompleto' },
      { item: 'her2', status: 'presente_verificado', gapType: null },
    ];

    expect(medirFaltantes(esperados, enviados)).toEqual({
      esperados: 2,
      sensibilidad: 1,
      especificidad: 1,
      gapType: { correctos: 2, total: 2 },
    });
  });

  it('baja la sensibilidad cuando un faltante sembrado no tiene vacío en el checklist', () => {
    const enviados = [
      { item: 'ki67', status: 'faltante', gapType: 'no_buscado' },
      { item: 're', status: 'presente_verificado', gapType: null },
    ];

    expect(medirFaltantes(esperados, enviados)).toMatchObject({
      sensibilidad: 0.5,
      gapType: { correctos: 1, total: 2 },
    });
  });

  it('baja la especificidad cuando el checklist reporta un vacío que no se sembró y no cuenta los no_aplica', () => {
    const enviados = [
      { item: 'ki67', status: 'faltante', gapType: 'no_buscado' },
      { item: 're', status: 'faltante', gapType: 'incompleto' },
      { item: 'her2', status: 'faltante', gapType: 'no_buscado' },
      { item: 'psa', status: 'presente_verificado', gapType: null },
      { item: 'gleason', status: 'no_aplica', gapType: null },
    ];

    expect(medirFaltantes(esperados, enviados)).toMatchObject({ especificidad: 0.5 });
  });

  it('cuenta como acierto de gapType solo el tipo exacto aunque el vacío exista', () => {
    const enviados = [
      { item: 'ki67', status: 'faltante', gapType: 'no_encontrado' },
      { item: 're', status: 'presente_sin_verificar', gapType: 'incompleto' },
    ];

    expect(medirFaltantes(esperados, enviados)).toMatchObject({
      sensibilidad: 1,
      gapType: { correctos: 1, total: 2 },
    });
  });

  it('devuelve null y no 0 cuando no hay muestra para la razón', () => {
    expect(
      medirFaltantes([], [{ item: 'her2', status: 'faltante', gapType: 'no_buscado' }]),
    ).toMatchObject({ esperados: 0, sensibilidad: null });
    expect(medirFaltantes(esperados, [])).toMatchObject({ especificidad: null, sensibilidad: 0 });
  });
});
