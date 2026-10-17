import type {
  CasoClinico,
  FilaDeAtributo,
  FilaDeBiomarcador,
  FilaDeDiagnostico,
  FilaDeEvento,
  FilaDeTratamientoPrevio,
} from '../../../src/modules/evidence-analysis/evidence-analysis.repository.js';

/** Builders de filas SINTÉTICAS para los unitarios del contexto clínico (RN-13, RN-14): ningún dato real. */

const PROCEDENCIA_SEMBRADA = {
  entryMethod: 'seed',
  extractionConfidence: 'n_a',
  reviewStatus: 'verificado',
  conflictsWithId: null,
} as const;

export function diagnosticoDeEjemplo(resto: Partial<FilaDeDiagnostico> = {}): FilaDeDiagnostico {
  return {
    id: 'dx-1',
    cancerType: 'prostata',
    histology: 'adenocarcinoma acinar',
    grade: 'Gleason 4+3=7 · ISUP 3',
    stagingSystem: 'TNM_8',
    stageValue: 'T2cN0M0',
    performanceScale: 'ECOG',
    performanceValue: 0,
    diagnosedAt: '2026-08-20',
    ...PROCEDENCIA_SEMBRADA,
    ...resto,
  };
}

export function biomarcadorDeEjemplo(resto: Partial<FilaDeBiomarcador> = {}): FilaDeBiomarcador {
  return {
    id: 'bm-1',
    name: 'PSA',
    value: '12.4',
    resultType: 'cuantitativo',
    clinicalSignificance: 'alterado',
    performedAt: '2026-09-26',
    createdAt: '2026-09-26T10:00:00.000Z',
    ...PROCEDENCIA_SEMBRADA,
    ...resto,
  };
}

export function atributoDeEjemplo(resto: Partial<FilaDeAtributo> = {}): FilaDeAtributo {
  return {
    id: 'at-1',
    attributeKey: 'estado_castracion',
    value: 'sensible',
    observedAt: '2026-08-20',
    ...PROCEDENCIA_SEMBRADA,
    ...resto,
  };
}

export function tratamientoPrevioDeEjemplo(
  resto: Partial<FilaDeTratamientoPrevio> = {},
): FilaDeTratamientoPrevio {
  return {
    id: 'tp-1',
    lineNumber: 1,
    setting: 'primera_linea_metastasica',
    regimenName: 'Deprivación androgénica',
    atcCodes: [],
    startedAt: '2026-03-01',
    endedAt: null,
    ongoing: true,
    endReason: 'desconocido',
    ...PROCEDENCIA_SEMBRADA,
    ...resto,
  };
}

export function eventoDeEjemplo(resto: Partial<FilaDeEvento> = {}): FilaDeEvento {
  return {
    id: 'ev-1',
    eventType: 'progresion',
    eventDate: '2026-09-26',
    description: 'Progresión bioquímica',
    ...PROCEDENCIA_SEMBRADA,
    ...resto,
  };
}

export function casoDeEjemplo(resto: Partial<CasoClinico> = {}): CasoClinico {
  return {
    paciente: { id: 'paciente-sintetico', dataOrigin: 'sintetico', population: 'adulto' },
    diagnosticoActivo: diagnosticoDeEjemplo(),
    biomarcadores: [],
    atributos: [],
    tratamientosPrevios: [],
    eventos: [],
    ...resto,
  };
}

export const AHORA_DE_EJEMPLO = new Date('2026-10-16T12:00:00.000Z');
