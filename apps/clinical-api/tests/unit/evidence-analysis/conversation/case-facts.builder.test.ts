import { describe, expect, it } from 'vitest';
import type { ClinicalContext } from '../../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { construirContextoPermitido } from '../../../../src/modules/evidence-analysis/clinical-context.builder.js';
import { construirHechosDelCaso } from '../../../../src/modules/evidence-analysis/conversation/case-facts.builder.js';
import type { CasoClinico } from '../../../../src/modules/evidence-analysis/evidence-analysis.repository.js';
import {
  atributoDeEjemplo,
  biomarcadorDeEjemplo,
  diagnosticoDeEjemplo,
  eventoDeEjemplo,
  tratamientoPrevioDeEjemplo,
} from '../casos.js';

const AHORA = new Date('2026-10-01T00:00:00Z');

function casoDe(resto: Partial<CasoClinico> = {}): CasoClinico {
  return {
    paciente: { id: 'p-1', dataOrigin: 'sintetico', population: 'adulto' },
    episodioId: null,
    diagnosticoActivo: diagnosticoDeEjemplo(),
    biomarcadores: [],
    atributos: [],
    tratamientosPrevios: [],
    eventos: [],
    ...resto,
  };
}

/** El contexto que el chat envía tras desidentificar: aquí sin texto libre que enmascarar. */
function hechosDe(caso: CasoClinico) {
  const { contexto, dataRefs } = construirContextoPermitido(caso, AHORA, [], true);
  const clinicalContext: ClinicalContext = { ...contexto, pseudoPatientId: 'psd_x' };
  return construirHechosDelCaso(clinicalContext, dataRefs, caso);
}

describe('construirHechosDelCaso', () => {
  it('asigna factRef opacos f1, f2… en el orden diagnóstico, biomarcadores, atributos, tratamientos y eventos', () => {
    const caso = casoDe({
      biomarcadores: [biomarcadorDeEjemplo()],
      atributos: [atributoDeEjemplo()],
      tratamientosPrevios: [tratamientoPrevioDeEjemplo()],
      eventos: [eventoDeEjemplo()],
    });

    const { hechos } = hechosDe(caso);

    expect(hechos.map((h) => [h.factRef, h.kind])).toEqual([
      ['f1', 'diagnostico'],
      ['f2', 'biomarcador'],
      ['f3', 'atributo'],
      ['f4', 'tratamiento'],
      ['f5', 'evento'],
    ]);
  });

  it('no incluye identificadores de registro ni fechas absolutas en los hechos que viajan a Backend 2', () => {
    const caso = casoDe({
      biomarcadores: [biomarcadorDeEjemplo()],
      eventos: [eventoDeEjemplo()],
    });

    const { hechos } = hechosDe(caso);

    const texto = JSON.stringify(hechos);
    expect(texto).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    for (const id of ['dx-1', 'bm-1', 'ev-1']) expect(texto).not.toContain(id);
  });

  it('calcula el día relativo respecto del diagnóstico con la fecha del registro', () => {
    const caso = casoDe({
      biomarcadores: [biomarcadorDeEjemplo({ id: 'bm-1', performedAt: '2026-09-19' })],
    });

    const { hechos } = hechosDe(caso);

    expect(hechos.map((h) => h.relativeDay)).toEqual([0, 30]);
  });

  it('deja relativeDay en null y no en 0 cuando la fecha del dato no es confiable', () => {
    const caso = casoDe({
      atributos: [atributoDeEjemplo({ observedAt: '2026-09-01', datePrecision: 'incierta' })],
    });

    const { hechos, tabla } = hechosDe(caso);

    expect(hechos[1]?.relativeDay).toBeNull();
    expect(tabla.get('f2')?.recordedDate).toBeNull();
  });

  it('conserva todos los valores vigentes de una serie con el mismo seriesKey y en orden cronológico', () => {
    const caso = casoDe({
      biomarcadores: [
        biomarcadorDeEjemplo({
          id: 'bm-3',
          value: '4.2',
          performedAt: '2027-02-16',
          createdAt: '2027-02-16T10:00:00.000Z',
        }),
        biomarcadorDeEjemplo({
          id: 'bm-1',
          value: '8.5',
          performedAt: '2026-08-20',
          createdAt: '2026-08-20T10:00:00.000Z',
        }),
        biomarcadorDeEjemplo({
          id: 'bm-2',
          value: '6.1',
          performedAt: '2026-11-18',
          createdAt: '2026-11-18T10:00:00.000Z',
        }),
      ],
    });

    const { hechos } = hechosDe(caso);

    const psa = hechos.filter((h) => h.seriesKey === 'psa');
    expect(psa.map((h) => h.relativeDay)).toEqual([0, 90, 180]);
    expect(psa.map((h) => h.verbalization)).toEqual([
      'PSA: 8.5, alterado',
      'PSA: 6.1, alterado',
      'PSA: 4.2, alterado',
    ]);
  });

  it('verbaliza el diagnóstico con histología, estadio y escala funcional como premisa del NLI', () => {
    const { hechos } = hechosDe(casoDe());

    expect(hechos[0]?.verbalization).toBe(
      'Adenocarcinoma acinar de prostata, Gleason 4+3=7 · ISUP 3, estadio T2cN0M0 (TNM 8), ECOG 0',
    );
  });

  it('marca el hecho como corregido cuando el registro vigente es una corrección manual', () => {
    const caso = casoDe({
      biomarcadores: [
        biomarcadorDeEjemplo({
          name: 'HER2',
          value: '3+',
          entryMethod: 'manual_correction',
          reviewStatus: 'corregido',
        }),
      ],
    });

    const { hechos } = hechosDe(caso);

    expect(hechos[1]).toMatchObject({
      verbalization: 'HER2: 3+, alterado',
      corrected: true,
      reviewStatus: 'corregido',
    });
  });

  it('recuerda en la tabla el recurso, el origen y la fecha del registro de cada factRef', () => {
    const caso = casoDe({
      biomarcadores: [biomarcadorDeEjemplo({ id: 'bm-9', performedAt: '2026-09-26' })],
    });

    const { tabla } = hechosDe(caso);

    expect(tabla.get('f2')).toEqual({
      tabla: 'biomarker',
      id: 'bm-9',
      origin: 'seed',
      relativeDay: 37,
      recordedDate: '2026-09-26',
    });
  });

  it('no incluye ningún hecho cuando el caso no tiene diagnóstico ni datos', () => {
    const { hechos, tabla } = hechosDe(casoDe({ diagnosticoActivo: null }));

    expect(hechos).toEqual([]);
    expect(tabla.size).toBe(0);
  });
});
