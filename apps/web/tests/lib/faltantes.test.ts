import { describe, expect, it } from 'vitest';
import type {
  CompletenessItem,
  CompletenessView,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import checklistF_M2 from '../../../../contracts/examples/completeness-f-m2.json';
import { hrefDeVistaDeCaso } from '../../lib/ficha/anclas';
import {
  debeContinuarConAviso,
  accionDeFaltante,
  hrefDeColumnaDatosCriticos,
  lecturaDeLaVista,
  presentarEstado,
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

describe('lecturaDeLaVista con todos los ítems', () => {
  it('conserva los 12 ítems en el orden del servidor y la versión del catálogo', () => {
    const lectura = lecturaDeLaVista(vista);

    expect(lectura.tipo === 'ok' && lectura.items.map((i) => i.item)).toEqual(
      vista.items.map((i) => i.item),
    );
    expect(lectura.tipo === 'ok' && lectura.catalogVersion).toBe('test-1.0.0');
  });
});

describe('accionDeFaltante', () => {
  const de = (entity: CompletenessItem['destination']['entity']) =>
    ({
      ...vista.items[1]!,
      item: 'ki67',
      destination: { entity, field: null },
    }) as CompletenessItem;

  it.each([
    ['Biomarker', 'biomarcador'],
    ['Diagnosis', 'diagnostico'],
    ['ClinicalAttribute', 'atributo'],
    ['PriorTreatment', 'tratamiento'],
  ] as const)(
    'devuelve la acción %s → %s con la clave del ítem y nunca cargar documento',
    (entidad, tipo) => {
      expect(accionDeFaltante(de(entidad))).toEqual({ tipo, item: 'ki67' });
    },
  );

  it('no devuelve acción cuando la entidad de destino es desconocida', () => {
    expect(accionDeFaltante(de('Otra' as never))).toBeNull();
  });
});

describe('presentarEstado', () => {
  it.each([
    ['presente_verificado', '✓', 'Presente y verificado'],
    ['presente_sin_verificar', '◐', 'Presente sin verificar'],
    ['faltante', '◌', 'Faltante'],
    ['no_aplica', '·', 'No aplica'],
  ] as const)('devuelve símbolo y texto cuando el estado es %s', (estado, simbolo, texto) => {
    expect(presentarEstado(estado)).toEqual({ simbolo, texto });
  });
});

describe('hrefDeColumnaDatosCriticos', () => {
  it('lleva a los datos críticos de la vista de caso cualquiera que sea el destino', () => {
    expect(hrefDeColumnaDatosCriticos(ID)).toBe(hrefDeVistaDeCaso(ID, 'datos-criticos'));
  });
});

describe('debeContinuarConAviso', () => {
  it.each<[string, LecturaDelChecklist, boolean]>([
    ['hay faltantes', lecturaDeLaVista(vista), true],
    ['el checklist no está disponible', { tipo: 'no_disponible' }, true],
    [
      'no hay faltantes',
      {
        tipo: 'ok',
        cancerTypeEnabled: true,
        catalogVersion: 'test-1.0.0',
        items: [],
        faltantes: [],
      },
      false,
    ],
  ])('devuelve el valor esperado cuando %s', (_caso, lectura, esperado) => {
    expect(debeContinuarConAviso(lectura)).toBe(esperado);
  });
});
