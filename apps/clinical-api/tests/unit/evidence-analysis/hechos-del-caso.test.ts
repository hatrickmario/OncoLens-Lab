import { describe, expect, it } from 'vitest';
import { construirContextoPermitido } from '../../../src/modules/evidence-analysis/clinical-context.builder.js';
import { construirHechosDelCaso } from '../../../src/modules/evidence-analysis/conversation/hechos-del-caso.js';
import {
  AHORA_DE_EJEMPLO,
  atributoDeEjemplo,
  biomarcadorDeEjemplo,
  casoDeEjemplo,
  diagnosticoDeEjemplo,
  eventoDeEjemplo,
  tratamientoPrevioDeEjemplo,
} from './casos.js';

const caso = casoDeEjemplo({
  diagnosticoActivo: diagnosticoDeEjemplo({
    id: 'dx-1',
    cancerType: 'mama',
    histology: 'carcinoma ductal infiltrante',
    grade: 'Nottingham grado 2',
    stagingSystem: 'TNM_8',
    stageValue: 'IIA',
    performanceScale: 'ECOG',
    performanceValue: 1,
    diagnosedAt: '2026-01-10',
  }),
  biomarcadores: [
    biomarcadorDeEjemplo({
      id: 'bm-1',
      name: 'HER2',
      value: '3+ (IHQ)',
      clinicalSignificance: 'relevante',
      performedAt: '2026-02-09',
    }),
  ],
  atributos: [
    atributoDeEjemplo({
      id: 'at-1',
      attributeKey: 'estado_menopausico',
      value: 'posmenopausica',
      observedAt: '2026-01-20',
      datePrecision: 'incierta',
    }),
  ],
  tratamientosPrevios: [
    tratamientoPrevioDeEjemplo({
      id: 'tp-1',
      regimenName: 'quimioterapia neoadyuvante',
      lineNumber: 1,
      startedAt: '2026-03-01',
    }),
  ],
  eventos: [
    eventoDeEjemplo({
      id: 'ev-1',
      eventType: 'cirugia',
      description: 'cirugía conservadora',
      eventDate: '2026-05-01',
      datePrecision: 'dia',
    }),
  ],
});

const { contexto, dataRefs } = construirContextoPermitido(caso, AHORA_DE_EJEMPLO, []);
const clinicalContext = { ...contexto, pseudoPatientId: 'psd_TestPseudonimo0001' };

describe('construirHechosDelCaso', () => {
  const hechos = construirHechosDelCaso(clinicalContext, dataRefs, caso);

  it('numera los hechos f1, f2… en el orden del contexto: diagnóstico, biomarcadores, atributos, tratamientos y eventos', () => {
    expect(hechos.caseFacts.map(({ factRef, kind }) => [factRef, kind])).toEqual([
      ['f1', 'diagnostico'],
      ['f2', 'biomarcador'],
      ['f3', 'atributo'],
      ['f4', 'tratamiento'],
      ['f5', 'evento'],
    ]);
  });

  it('verbaliza el diagnóstico y el biomarcador sin fechas absolutas', () => {
    expect(hechos.caseFacts[0]?.verbalization).toBe(
      'carcinoma ductal infiltrante, Nottingham grado 2, estadio IIA (TNM_8), ECOG 1',
    );
    expect(hechos.caseFacts[1]).toMatchObject({
      verbalization: 'HER2: 3+ (IHQ), relevante',
      seriesKey: 'her2',
      reviewStatus: 'verificado',
    });
    expect(JSON.stringify(hechos.caseFacts)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('calcula el día relativo al diagnóstico y lo deja en null cuando el dato no tiene fecha confiable', () => {
    expect(hechos.caseFacts.map((hecho) => hecho.relativeDay)).toEqual([0, 30, null, 50, 111]);
  });

  it('resuelve cada factRef al recurso que lo respalda con su origen y su fecha registrada', () => {
    expect(hechos.enlaces.get('f2')).toEqual({
      resourceType: 'biomarker',
      resourceId: 'bm-1',
      origin: 'seed',
      relativeDay: 30,
      recordedDate: '2026-02-09',
    });
    expect(hechos.enlaces.get('f3')).toMatchObject({
      resourceType: 'clinical_attribute',
      relativeDay: null,
      recordedDate: null,
    });
  });

  it('devuelve cero hechos cuando el paciente no tiene datos clínicos', () => {
    const vacio = casoDeEjemplo({
      diagnosticoActivo: null,
      biomarcadores: [],
      atributos: [],
      tratamientosPrevios: [],
      eventos: [],
    });
    const permitido = construirContextoPermitido(vacio, AHORA_DE_EJEMPLO, []);

    const resultado = construirHechosDelCaso(
      { ...permitido.contexto, pseudoPatientId: 'psd_TestPseudonimo0002' },
      permitido.dataRefs,
      vacio,
    );

    expect(resultado.caseFacts).toEqual([]);
    expect(resultado.enlaces.size).toBe(0);
  });
});
