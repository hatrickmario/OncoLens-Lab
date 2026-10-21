import { describe, expect, it } from 'vitest';
import { verbalizarDatoDelContexto } from '../../../src/modules/evidence-analysis/analysis-basis.verbalizacion.js';
import type { ClinicalContext } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';

const provenance = {
  entryMethod: 'seed',
  extractionConfidence: 'n_a',
  reviewStatus: 'verificado',
  conflict: false,
} as const;

const biomarcador = (resto: Partial<ClinicalContext['biomarkers'][number]> = {}) =>
  ({
    tipo: 'biomarcador',
    dato: {
      dataRef: 'r2',
      biomarkerName: 'HER2',
      value: '3+ (IHQ)',
      resultType: 'cualitativo',
      clinicalSignificance: 'relevante',
      monthsAgo: 1,
      provenance,
      ...resto,
    },
  }) as const;

const diagnostico = (resto: Partial<NonNullable<ClinicalContext['diagnosis']>> = {}) =>
  ({
    tipo: 'diagnostico',
    dato: {
      dataRef: 'r1',
      cancerType: 'mama',
      histology: 'carcinoma ductal infiltrante',
      grade: null,
      stagingSystem: 'TNM_8',
      stageValue: 'IIA',
      performanceScale: null,
      performanceValue: null,
      monthsSinceDiagnosis: 1,
      provenance,
      ...resto,
    },
  }) as const;

describe('verbalizarDatoDelContexto', () => {
  it('escribe el tipo de cáncer seguido del sistema de estadificación y su valor cuando el diagnóstico tiene estadio', () => {
    expect(verbalizarDatoDelContexto(diagnostico())).toBe('mama · TNM_8 IIA');
  });

  it('escribe la clave y el valor separados por dos puntos cuando el dato es un atributo', () => {
    const atributo = {
      tipo: 'atributo',
      dato: {
        dataRef: 'r3',
        key: 'estado_menopausico',
        value: 'posmenopausica',
        monthsAgo: 1,
        provenance,
      },
    } as const;

    expect(verbalizarDatoDelContexto(atributo)).toBe('estado_menopausico: posmenopausica');
  });

  it.each([
    ['con línea', 2, 'AC-T · línea 2'],
    ['sin línea', null, 'AC-T'],
  ])('escribe el régimen %s cuando el dato es un tratamiento previo', (_caso, linea, esperado) => {
    const tratamiento = {
      tipo: 'tratamiento',
      dato: {
        dataRef: 'r4',
        lineNumber: linea,
        setting: 'adyuvante',
        regimenName: 'AC-T',
        atcCodes: [] as string[],
        monthsSinceStart: 12,
        monthsSinceEnd: 8,
        endReason: 'completado',
        provenance,
      },
    } as const;

    expect(verbalizarDatoDelContexto(tratamiento)).toBe(esperado);
  });

  it('escribe solo el tipo del evento sin su descripción libre ni su fecha relativa', () => {
    const evento = {
      tipo: 'evento',
      dato: {
        dataRef: 'r5',
        eventType: 'diagnostico',
        monthsAgo: 1,
        description: 'Carcinoma ductal infiltrante de mama',
        provenance,
      },
    } as const;

    expect(verbalizarDatoDelContexto(evento)).toBe('diagnostico');
  });

  it('omite el valor cuando el biomarcador no lo trae', () => {
    expect(verbalizarDatoDelContexto(biomarcador({ value: '' }))).toBe('HER2');
  });

  it('omite el estadio cuando el contexto lo trae como No disponible', () => {
    const sinEstadio = diagnostico({ stagingSystem: 'No disponible', stageValue: 'No disponible' });

    expect(verbalizarDatoDelContexto(sinEstadio)).toBe('mama');
  });

  it('escribe solo el valor del estadio cuando falta el sistema de estadificación', () => {
    const sinSistema = diagnostico({ stagingSystem: 'No disponible', stageValue: 'IIA' });

    expect(verbalizarDatoDelContexto(sinSistema)).toBe('mama · IIA');
  });

  it('une el nombre del biomarcador con su valor cuando el valor ya trae el método', () => {
    expect(verbalizarDatoDelContexto(biomarcador())).toBe('HER2 3+ (IHQ)');
  });
});
