import { describe, expect, it } from 'vitest';
import {
  MARCA_DE_CORRECCION,
  contrapartesDeConflicto,
  conMarcaDeCorreccion,
} from '../../../src/modules/evidence-analysis/conversation/conflictos.js';

describe('contrapartesDeConflicto', () => {
  it('marca el par de forma simétrica cuando un dato apunta al otro con conflicts_with_id', () => {
    const mapa = contrapartesDeConflicto([
      { factRef: 'f1', id: 'a', conflictsWithId: null },
      { factRef: 'f6', id: 'b', conflictsWithId: 'a' },
    ]);

    expect([...mapa.entries()].sort()).toEqual([
      ['f1', 'f6'],
      ['f6', 'f1'],
    ]);
  });

  it('ignora el vínculo cuando la contraparte no está entre los hechos', () => {
    const mapa = contrapartesDeConflicto([{ factRef: 'f2', id: 'b', conflictsWithId: 'ajeno' }]);

    expect(mapa.size).toBe(0);
  });

  it('devuelve un mapa vacío cuando ningún dato tiene conflicto', () => {
    expect(contrapartesDeConflicto([{ factRef: 'f1', id: 'a', conflictsWithId: null }]).size).toBe(
      0,
    );
  });
});

describe('conMarcaDeCorreccion', () => {
  it('añade el sufijo fijo (corregido) a la verbalización', () => {
    expect(conMarcaDeCorreccion('HER2: 3+, relevante')).toBe(
      `HER2: 3+, relevante ${MARCA_DE_CORRECCION}`,
    );
    expect(MARCA_DE_CORRECCION).toBe('(corregido)');
  });
});
