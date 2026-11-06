import { describe, expect, it } from 'vitest';
import type { ConversationDataLink } from '../../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  EnlaceDeHecho,
  TablaDeHechos,
} from '../../../../src/modules/evidence-analysis/conversation/case-facts.builder.js';
import {
  ordenarPorDiaRelativo,
  resolverDataLinks,
} from '../../../../src/modules/evidence-analysis/conversation/data-links.js';

const enlace = (
  id: string,
  relativeDay: number | null,
  recordedDate: string | null,
): EnlaceDeHecho => ({
  tabla: 'biomarker',
  id,
  origin: 'manual',
  relativeDay,
  recordedDate,
});

const TABLA: TablaDeHechos = new Map([
  ['f1', enlace('bm-1', 0, '2026-08-20')],
  ['f2', enlace('bm-2', 90, '2026-11-18')],
  ['f3', enlace('bm-3', 180, '2027-02-16')],
  ['f4', enlace('bm-4', null, null)],
]);

const dia = (relativeDay: number | null): ConversationDataLink => ({
  factRef: 'f',
  resourceType: 'biomarker',
  resourceId: 'x',
  origin: 'manual',
  relativeDay,
  recordedDate: null,
});

describe('ordenarPorDiaRelativo', () => {
  it('ordena de menor a mayor día relativo cuando los enlaces llegan desordenados', () => {
    expect(ordenarPorDiaRelativo([dia(180), dia(0), dia(90)]).map((e) => e.relativeDay)).toEqual([
      0, 90, 180,
    ]);
  });

  it('pone al final el enlace sin fecha confiable y no lo trata como día cero', () => {
    expect(ordenarPorDiaRelativo([dia(null), dia(5), dia(0)]).map((e) => e.relativeDay)).toEqual([
      0,
      5,
      null,
    ]);
  });

  it('conserva el orden de llegada cuando dos enlaces tienen el mismo día', () => {
    const a = { ...dia(10), factRef: 'fa' };
    const b = { ...dia(10), factRef: 'fb' };

    expect(ordenarPorDiaRelativo([b, a]).map((e) => e.factRef)).toEqual(['fb', 'fa']);
  });
});

describe('resolverDataLinks', () => {
  it('resuelve cada factRef con el recurso, el origen y la fecha del registro, en orden ascendente de día relativo', () => {
    const enlaces = resolverDataLinks(['f3', 'f1', 'f2'], TABLA);

    expect(enlaces).toEqual([
      {
        factRef: 'f1',
        resourceType: 'biomarker',
        resourceId: 'bm-1',
        origin: 'manual',
        relativeDay: 0,
        recordedDate: '2026-08-20',
      },
      {
        factRef: 'f2',
        resourceType: 'biomarker',
        resourceId: 'bm-2',
        origin: 'manual',
        relativeDay: 90,
        recordedDate: '2026-11-18',
      },
      {
        factRef: 'f3',
        resourceType: 'biomarker',
        resourceId: 'bm-3',
        origin: 'manual',
        relativeDay: 180,
        recordedDate: '2027-02-16',
      },
    ]);
  });

  it('devuelve un solo enlace por factRef cuando varios bloques citan el mismo dato', () => {
    expect(resolverDataLinks(['f1', 'f1', 'f1'], TABLA)).toHaveLength(1);
  });

  it('descarta el factRef que la tabla no conoce porque un enlace sin registro no puede mostrarse', () => {
    expect(resolverDataLinks(['f1', 'f99'], TABLA).map((e) => e.factRef)).toEqual(['f1']);
  });

  it('deja relativeDay y recordedDate en null cuando el dato no tiene fecha confiable', () => {
    expect(resolverDataLinks(['f4'], TABLA)[0]).toMatchObject({
      relativeDay: null,
      recordedDate: null,
    });
  });
});
