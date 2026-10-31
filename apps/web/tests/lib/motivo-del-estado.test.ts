import { describe, expect, it } from 'vitest';
import type { ApplicabilityCriterion } from '../../../../packages/api-contracts/src/types/clinical-api';
import { motivoDelEstado } from '../../lib/evidence/motivo-del-estado';
import { mensajes } from '../../lib/mensajes';

const { motivoParcial, causaDesconocido } = mensajes().evidence.aplicabilidad;
const SIN_VALORES = { elegibilidad: [], contexto: [] };

function criterio(parcial: Partial<ApplicabilityCriterion>): ApplicabilityCriterion {
  return {
    criterion: 'ecog',
    patientValue: null,
    studyPopulationValue: null,
    status: 'desconocido',
    unknownReason: null,
    isExclusionary: false,
    patientDataWarning: null,
    citedSources: [],
    ...parcial,
  };
}

describe('motivoDelEstado', () => {
  it('devuelve null cuando el criterio coincide o no coincide', () => {
    expect(motivoDelEstado(criterio({ status: 'coincide' }), SIN_VALORES)).toBeNull();
    expect(motivoDelEstado(criterio({ status: 'no_coincide' }), SIN_VALORES)).toBeNull();
  });

  it('devuelve el motivo de partialReason cuando el criterio es Parcial', () => {
    const parcial = criterio({ status: 'parcial', partialReason: 'mezclada' });

    expect(motivoDelEstado(parcial, SIN_VALORES)).toBe(motivoParcial.mezclada);
  });

  it('devuelve null cuando el criterio es Parcial sin motivo registrado', () => {
    expect(motivoDelEstado(criterio({ status: 'parcial' }), SIN_VALORES)).toBeNull();
  });

  it.each([
    ['falta_en_paciente'],
    ['no_reportado_por_fuente'],
    ['valores_en_conflicto'],
    ['varios_valores_en_la_fuente'],
    ['respaldo_fallido'],
    ['sin_regla_de_comparacion'],
  ] as const)('devuelve la causa de %s cuando el criterio es Desconocido', (causa) => {
    expect(motivoDelEstado(criterio({ unknownReason: causa }), SIN_VALORES)).toBe(
      causaDesconocido[causa],
    );
  });

  it('devuelve causa no registrada cuando el Desconocido no trae unknownReason', () => {
    expect(motivoDelEstado(criterio({}), SIN_VALORES)).toBe(causaDesconocido.sin_causa_registrada);
  });

  it('devuelve la causa de subgrupo cuando no_reportado_por_fuente solo trae valores de contexto', () => {
    const valores = {
      elegibilidad: [],
      contexto: [{ value: 'TNBC', chunkId: 'c1', scope: 'subgrupo' as const }],
    };

    expect(motivoDelEstado(criterio({ unknownReason: 'no_reportado_por_fuente' }), valores)).toBe(
      causaDesconocido.solo_subgrupo,
    );
  });
});
