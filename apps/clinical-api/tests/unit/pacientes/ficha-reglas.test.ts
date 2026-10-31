import { describe, expect, it } from 'vitest';
import type {
  FilaDeBiomarcador,
  FilaDeDiagnostico,
} from '../../../src/modules/patients/ficha.repository.js';
import {
  comoBiomarcador,
  comoProvenance,
  seleccionarDiagnosticoVigente,
  ultimoValorPorBiomarcador,
} from '../../../src/modules/patients/ficha.reglas.js';
import { ESTADOS_PENDIENTES_DE_REVISION } from '../../../src/modules/compartido/estados-de-revision.js';

const PROCEDENCIA = {
  entryMethod: 'seed',
  extractionConfidence: 'n_a',
  reviewStatus: 'verificado',
  conflictsWithId: null,
  sourceDocumentId: null,
} as const;

const diagnostico = (id: string, resto: Partial<FilaDeDiagnostico> = {}): FilaDeDiagnostico => ({
  id,
  cancerType: 'mama',
  icd10Code: null,
  histology: null,
  histologyCode: null,
  grade: null,
  stagingSystem: 'TNM_8',
  stageValue: 'IIA',
  performanceScale: 'ECOG',
  performanceValue: 1,
  diagnosedAt: '2026-09-01',
  isActive: true,
  ...PROCEDENCIA,
  ...resto,
});

const biomarcador = (id: string, resto: Partial<FilaDeBiomarcador> = {}): FilaDeBiomarcador => ({
  id,
  name: 'PSA',
  loincCode: null,
  mappingStatus: 'no_mapeado',
  value: '4.2',
  unit: 'ng/mL',
  referenceRange: '',
  resultType: 'cuantitativo',
  clinicalSignificance: 'alterado',
  significanceSource: 'documento',
  examType: 'laboratorio',
  performedAt: '2026-01-01',
  createdAt: new Date('2026-01-02T00:00:00Z'),
  ...PROCEDENCIA,
  ...resto,
});

describe('seleccionarDiagnosticoVigente', () => {
  it('devuelve null cuando el paciente no tiene diagnósticos', () => {
    expect(seleccionarDiagnosticoVigente([])).toBeNull();
  });

  it('devuelve el activo cuando hay uno inactivo y uno activo', () => {
    const vigente = seleccionarDiagnosticoVigente([
      diagnostico('d-1', { isActive: false }),
      diagnostico('d-2'),
    ]);

    expect(vigente?.id).toBe('d-2');
  });

  it('devuelve null cuando todos están inactivos', () => {
    expect(seleccionarDiagnosticoVigente([diagnostico('d-1', { isActive: false })])).toBeNull();
  });

  it('devuelve el de fecha más reciente cuando hay varios activos', () => {
    const vigente = seleccionarDiagnosticoVigente([
      diagnostico('d-1', { diagnosedAt: '2026-01-01' }),
      diagnostico('d-2', { diagnosedAt: '2026-08-01' }),
    ]);

    expect(vigente?.id).toBe('d-2');
  });
});

describe('ultimoValorPorBiomarcador', () => {
  it('deja una sola entrada por nombre, la de performedAt más reciente', () => {
    const ultimos = ultimoValorPorBiomarcador([
      biomarcador('b-1', { performedAt: '2026-01-01', value: '4.2' }),
      biomarcador('b-3', { performedAt: '2026-09-01', value: '12.4' }),
      biomarcador('b-2', { performedAt: '2026-05-01', value: '9.8' }),
    ]);

    expect(ultimos.map((b) => b.value)).toEqual(['12.4']);
  });

  it('desempata por fecha de alta y luego por id cuando performedAt coincide', () => {
    const ultimos = ultimoValorPorBiomarcador([
      biomarcador('b-1', { createdAt: new Date('2026-02-01T00:00:00Z') }),
      biomarcador('b-2', { createdAt: new Date('2026-03-01T00:00:00Z') }),
    ]);

    expect(ultimos.map((b) => b.id)).toEqual(['b-2']);
  });

  it('conserva un biomarcador por cada nombre distinto, ordenados por nombre', () => {
    const ultimos = ultimoValorPorBiomarcador([
      biomarcador('b-1', { name: 'HER2' }),
      biomarcador('b-2', { name: 'Ki-67' }),
      biomarcador('b-3', { name: 'Estrógeno' }),
    ]);

    expect(ultimos.map((b) => b.name)).toEqual(['Estrógeno', 'HER2', 'Ki-67']);
  });
});

describe('comoProvenance', () => {
  it('marca conflict cuando el dato tiene conflicts_with_id', () => {
    expect(comoProvenance({ ...PROCEDENCIA, conflictsWithId: 'otro-dato' }, []).conflict).toBe(
      true,
    );
  });

  it('no repite el documento principal entre los adicionales', () => {
    const provenance = comoProvenance({ ...PROCEDENCIA, sourceDocumentId: 'doc-1' }, [
      'doc-1',
      'doc-2',
    ]);

    expect(provenance.additionalSourceDocumentIds).toEqual(['doc-2']);
  });
});

describe('comoBiomarcador', () => {
  it('deja trend en null y el rango vacío como null', () => {
    const resultado = comoBiomarcador(biomarcador('b-1'), []);

    expect(resultado.trend).toBeNull();
    expect(resultado.referenceRange).toBeNull();
  });
});

describe('ESTADOS_PENDIENTES_DE_REVISION', () => {
  it('contiene solo requiere_revision y no auto_aceptado', () => {
    expect(ESTADOS_PENDIENTES_DE_REVISION).toEqual(['requiere_revision']);
  });
});
