import { describe, expect, it } from 'vitest';
import type { DiscardedOption } from '../../../../packages/api-contracts/src/types/clinical-api';
import { resumirMotivos } from '../../lib/evidence/resumir-motivos';

function descartada(discardReason: DiscardedOption['discardReason']): DiscardedOption {
  return { option: 'Opción sintética', rationale: 'r', discardReason, unsupportedClaims: [] };
}

describe('resumirMotivos', () => {
  it('devuelve lista vacía cuando no hay descartadas', () => {
    expect(resumirMotivos([])).toEqual([]);
  });

  it('devuelve un solo motivo con su recuento cuando todas comparten motivo', () => {
    expect(resumirMotivos([descartada('sin_citas')])).toEqual([{ motivo: 'sin_citas', n: 1 }]);
  });

  it('ordena por el enum del contrato y no por el orden de llegada cuando hay dos motivos', () => {
    const resumen = resumirMotivos([descartada('sin_citas'), descartada('cita_invalida')]);
    expect(resumen.map((m) => m.motivo)).toEqual(['cita_invalida', 'sin_citas']);
  });

  it('suma el recuento cuando un motivo se repite', () => {
    const resumen = resumirMotivos([
      descartada('sin_citas'),
      descartada('cita_invalida'),
      descartada('cita_invalida'),
    ]);
    expect(resumen).toEqual([
      { motivo: 'cita_invalida', n: 2 },
      { motivo: 'sin_citas', n: 1 },
    ]);
  });
});
