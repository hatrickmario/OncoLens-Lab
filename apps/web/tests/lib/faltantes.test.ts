import { describe, expect, it } from 'vitest';
import type { CompletenessView } from '../../../../packages/api-contracts/src/types/clinical-api';
import checklistF_M2 from '../../../../contracts/examples/completeness-f-m2.json';
import { hrefDeFicha } from '../../lib/ficha/anclas';
import {
  debeContinuarConAviso,
  enlaceDeRegistro,
  lecturaDeLaVista,
  type LecturaDelChecklist,
} from '../../lib/evidence/faltantes';

const vista = checklistF_M2 as CompletenessView;
const ID = '0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10';

describe('lecturaDeLaVista', () => {
  it('conserva solo los ítems faltante y excluye presentes y no aplicables', () => {
    const lectura = lecturaDeLaVista(vista);

    expect(lectura.tipo === 'ok' && lectura.faltantes.map((i) => i.label)).toEqual([
      'Grado',
      'Receptor de progesterona',
      'HER2 (ISH)',
      'Ki-67',
      'Estado menopáusico',
      'BRCA germinal',
    ]);
  });
});

describe('enlaceDeRegistro', () => {
  const item = (entity: CompletenessView['items'][number]['destination']['entity']) =>
    ({
      ...vista.items[0]!,
      destination: { entity, field: null },
    }) as CompletenessView['items'][number];

  it('lleva a #diagnostico para Diagnosis y a #biomarcadores para Biomarker', () => {
    expect(enlaceDeRegistro(ID, item('Diagnosis'))).toBe(hrefDeFicha(ID, 'diagnostico'));
    expect(enlaceDeRegistro(ID, item('Biomarker'))).toBe(hrefDeFicha(ID, 'biomarcadores'));
  });

  it('lleva a la ficha sin ancla para ClinicalAttribute y PriorTreatment', () => {
    expect(enlaceDeRegistro(ID, item('ClinicalAttribute'))).toBe(hrefDeFicha(ID));
    expect(enlaceDeRegistro(ID, item('PriorTreatment'))).toBe(hrefDeFicha(ID));
  });
});

describe('debeContinuarConAviso', () => {
  it.each<[string, LecturaDelChecklist, boolean]>([
    ['hay faltantes', lecturaDeLaVista(vista), true],
    ['el checklist no está disponible', { tipo: 'no_disponible' }, true],
    ['no hay faltantes', { tipo: 'ok', cancerTypeEnabled: true, faltantes: [] }, false],
  ])('devuelve el valor esperado cuando %s', (_caso, lectura, esperado) => {
    expect(debeContinuarConAviso(lectura)).toBe(esperado);
  });
});
