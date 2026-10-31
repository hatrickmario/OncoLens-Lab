import { describe, expect, it } from 'vitest';
import type { ApplicabilityCriterion } from '../../../../packages/api-contracts/src/types/clinical-api';
import { valoresDelEstudio } from '../../lib/evidence/valores-del-estudio';

function criterio(parcial: Partial<ApplicabilityCriterion>): ApplicabilityCriterion {
  return {
    criterion: 'estado_menopausico',
    patientValue: null,
    studyPopulationValue: null,
    status: 'parcial',
    unknownReason: null,
    isExclusionary: false,
    patientDataWarning: null,
    citedSources: [],
    ...parcial,
  };
}

describe('valoresDelEstudio', () => {
  it('separa los valores de elegibilidad del contexto conservando el orden cuando el criterio trae la lista', () => {
    const resultado = valoresDelEstudio(
      criterio({
        studyPopulationValues: [
          { value: 'a', chunkId: 'c1', scope: 'elegibilidad' },
          { value: 'b', chunkId: 'c1', scope: 'subgrupo' },
          { value: 'c', chunkId: 'c2', scope: 'elegibilidad' },
          { value: 'd', chunkId: 'c2', scope: 'mencion' },
        ],
      }),
      ['c1', 'c2'],
    );

    expect(resultado.elegibilidad.map((v) => v.value)).toEqual(['a', 'c']);
    expect(resultado.contexto.map((v) => [v.value, v.scope])).toEqual([
      ['b', 'subgrupo'],
      ['d', 'mencion'],
    ]);
  });

  it('descarta los valores de un fragmento que la opción no cita cuando el criterio trae la lista', () => {
    const resultado = valoresDelEstudio(
      criterio({
        studyPopulationValues: [
          { value: 'citado', chunkId: 'c1', scope: 'elegibilidad' },
          { value: 'ajeno', chunkId: 'otro', scope: 'elegibilidad' },
        ],
      }),
      ['c1'],
    );

    expect(resultado.elegibilidad.map((v) => v.value)).toEqual(['citado']);
  });

  it('cae al valor único con el primer fragmento del criterio cuando solo viene studyPopulationValue', () => {
    const cita = { chunkId: 'c1' } as ApplicabilityCriterion['citedSources'][number];
    const resultado = valoresDelEstudio(
      criterio({ studyPopulationValue: 'positivo', citedSources: [cita] }),
      ['c1'],
    );

    expect(resultado.elegibilidad).toEqual([
      { value: 'positivo', chunkId: 'c1', scope: 'elegibilidad' },
    ]);
    expect(resultado.contexto).toEqual([]);
  });

  it('devuelve listas vacías cuando no hay ni lista ni valor único', () => {
    expect(valoresDelEstudio(criterio({ studyPopulationValues: [] }), ['c1'])).toEqual({
      elegibilidad: [],
      contexto: [],
    });
    expect(valoresDelEstudio(criterio({}), ['c1'])).toEqual({ elegibilidad: [], contexto: [] });
  });
});
