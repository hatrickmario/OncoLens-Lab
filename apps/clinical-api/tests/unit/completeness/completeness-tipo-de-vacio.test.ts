import { describe, expect, it } from 'vitest';
import {
  clasificarVacio,
  hayConflictoPendiente,
} from '../../../src/modules/completeness/completeness.rules.js';
import type { EvidenciaDelVacio } from '../../../src/modules/completeness/completeness.rules.js';
import type { ItemDeDatoCritico } from '../../../src/modules/completeness/ports.js';

const ki67: ItemDeDatoCritico = {
  key: 'ki67',
  label: 'Ki-67',
  cancerType: 'mama',
  destination: { entity: 'Biomarker', field: 'value', match: { name: 'Ki-67' } },
  minValues: 1,
  sourceDocumentTypes: ['examen'],
};

const evidencia = (resto: Partial<EvidenciaDelVacio> = {}): EvidenciaDelVacio => ({
  registrosVigentes: 0,
  conflictoPendiente: false,
  documentosProcesados: new Set<string>(),
  ...resto,
});

describe('clasificarVacio (US-263, regla pura)', () => {
  it('devuelve null cuando el ítem no aplica', () => {
    expect(clasificarVacio(ki67, 'no_aplica', evidencia())).toBeNull();
  });

  it('devuelve null cuando el ítem está verificado y sin conflicto', () => {
    expect(
      clasificarVacio(ki67, 'presente_verificado', evidencia({ registrosVigentes: 1 })),
    ).toBeNull();
  });

  it('devuelve por_conciliar cuando un registro vigente está en conflicto aunque el dato esté verificado', () => {
    const conflicto = evidencia({ registrosVigentes: 1, conflictoPendiente: true });

    expect(clasificarVacio(ki67, 'presente_verificado', conflicto)).toBe('por_conciliar');
  });

  it('devuelve incompleto cuando el dato está presente sin verificar y sin conflicto', () => {
    expect(
      clasificarVacio(ki67, 'presente_sin_verificar', evidencia({ registrosVigentes: 1 })),
    ).toBe('incompleto');
  });

  it('prefiere por_conciliar a incompleto cuando el dato sin verificar tiene un conflicto vigente', () => {
    const conflicto = evidencia({ registrosVigentes: 1, conflictoPendiente: true });

    expect(clasificarVacio(ki67, 'presente_sin_verificar', conflicto)).toBe('por_conciliar');
  });

  it('devuelve null cuando el ítem no aplica aunque haya un conflicto pendiente', () => {
    expect(clasificarVacio(ki67, 'no_aplica', evidencia({ conflictoPendiente: true }))).toBeNull();
  });

  it('devuelve incompleto cuando faltan valores para llegar a minValues y hay al menos un registro vigente', () => {
    const psa: ItemDeDatoCritico = { ...ki67, key: 'psa_serie', minValues: 2 };

    expect(clasificarVacio(psa, 'faltante', evidencia({ registrosVigentes: 1 }))).toBe(
      'incompleto',
    );
  });

  it('devuelve no_buscado cuando falta el dato y ningún documento procesado es de su tipo fuente', () => {
    const otroTipo = evidencia({ documentosProcesados: new Set(['historia_clinica']) });

    expect(clasificarVacio(ki67, 'faltante', evidencia())).toBe('no_buscado');
    expect(clasificarVacio(ki67, 'faltante', otroTipo)).toBe('no_buscado');
  });

  it('devuelve no_encontrado cuando falta el dato y hay un documento procesado de alguno de sus tipos fuente', () => {
    const menopausia: ItemDeDatoCritico = {
      ...ki67,
      key: 'estado_menopausico',
      sourceDocumentTypes: ['historia_clinica', 'examen'],
    };
    const procesado = evidencia({ documentosProcesados: new Set(['historia_clinica']) });

    expect(clasificarVacio(menopausia, 'faltante', procesado)).toBe('no_encontrado');
  });

  it('prefiere incompleto a no_encontrado cuando hay un registro vigente aunque exista un documento procesado', () => {
    const psa: ItemDeDatoCritico = { ...ki67, key: 'psa_serie', minValues: 2 };
    const ambos = evidencia({ registrosVigentes: 1, documentosProcesados: new Set(['examen']) });

    expect(clasificarVacio(psa, 'faltante', ambos)).toBe('incompleto');
  });

  it('prefiere por_conciliar a no_buscado cuando falta el valor vigente pero hay un conflicto pendiente', () => {
    expect(clasificarVacio(ki67, 'faltante', evidencia({ conflictoPendiente: true }))).toBe(
      'por_conciliar',
    );
  });
});

const registro = (id: string, columnas: Record<string, string | null>, estado = 'verificado') => ({
  id,
  reviewStatus: estado,
  fecha: '2026-01-01',
  creadoEn: '2026-01-01T00:00:00.000000Z',
  procedencia: { entryMethod: 'seed', sourceDocumentId: null, page: null },
  columnas,
});

const tnm: ItemDeDatoCritico = {
  key: 'tnm',
  label: 'Estadificación TNM',
  cancerType: 'mama',
  destination: { entity: 'Diagnosis', field: 'stage_value' },
  minValues: 1,
  sourceDocumentTypes: ['historia_clinica', 'examen'],
};

const re: ItemDeDatoCritico = {
  ...tnm,
  key: 're',
  destination: { entity: 'Biomarker', field: 'value', match: { name: 'RE' } },
};

describe('hayConflictoPendiente (RN-08, US-263)', () => {
  const vigente = registro('d-iia', { stage_value: 'IIA', histology: 'ductal' });
  const enConflicto = registro(
    'd-iib',
    { stage_value: 'IIB', histology: 'ductal' },
    'requiere_revision',
  );

  it('devuelve false cuando el paciente no tiene registros en conflicto', () => {
    expect(hayConflictoPendiente(tnm, { Diagnosis: [vigente] }, {})).toBe(false);
  });

  it('devuelve true cuando un registro en conflicto trae un valor distinto del que cuenta', () => {
    expect(hayConflictoPendiente(tnm, { Diagnosis: [vigente] }, { Diagnosis: [enConflicto] })).toBe(
      true,
    );
  });

  it('devuelve false cuando el registro en conflicto trae el mismo valor del campo que el que cuenta', () => {
    const histologia: ItemDeDatoCritico = {
      ...tnm,
      key: 'histologia',
      destination: { entity: 'Diagnosis', field: 'histology' },
    };

    expect(
      hayConflictoPendiente(histologia, { Diagnosis: [vigente] }, { Diagnosis: [enConflicto] }),
    ).toBe(false);
  });

  it('devuelve false cuando el registro en conflicto no tiene valor en el campo del ítem', () => {
    const sinGrado = registro('d-iib', { stage_value: 'IIB', grade: null }, 'requiere_revision');
    const grado: ItemDeDatoCritico = {
      ...tnm,
      key: 'grado',
      destination: { entity: 'Diagnosis', field: 'grade' },
    };

    expect(hayConflictoPendiente(grado, { Diagnosis: [vigente] }, { Diagnosis: [sinGrado] })).toBe(
      false,
    );
  });

  it('devuelve true cuando el registro en conflicto es el mismo que cuenta para el ítem', () => {
    const biomarcador = registro('b-1', { name: 'RE', value: 'negativo' }, 'requiere_revision');

    expect(
      hayConflictoPendiente(re, { Biomarker: [biomarcador] }, { Biomarker: [biomarcador] }),
    ).toBe(true);
  });

  it('devuelve false cuando el conflicto es de otro biomarcador que el del ítem', () => {
    const otro = registro('b-2', { name: 'RP', value: 'negativo' }, 'requiere_revision');

    expect(hayConflictoPendiente(re, { Biomarker: [] }, { Biomarker: [otro] })).toBe(false);
  });
});
