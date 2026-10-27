import { describe, expect, it } from 'vitest';
import { CAMPOS_COPIADOS_DEL_CORPUS, CAMPOS_GENERADOS } from '../src/index.js';

describe('origen de los campos del contrato', () => {
  it('lista exactamente los cinco campos copiados del corpus y los siete generados [US-068 AC-3, ARR-08, US-123]', () => {
    expect([...CAMPOS_COPIADOS_DEL_CORPUS]).toEqual([
      'chunkTextSnapshot',
      'title',
      'sourceName',
      'externalId',
      'authors',
    ]);
    expect([...CAMPOS_GENERADOS]).toEqual([
      'option',
      'rationale',
      'details',
      'unsupportedClaims',
      'limitations[].text',
      'synthesis',
      'studyPopulationValue',
    ]);
  });

  it('no repite ningún campo en las dos listas', () => {
    const repetidos = CAMPOS_GENERADOS.filter((campo) =>
      CAMPOS_COPIADOS_DEL_CORPUS.includes(campo),
    );
    expect(repetidos).toEqual([]);
  });
});
