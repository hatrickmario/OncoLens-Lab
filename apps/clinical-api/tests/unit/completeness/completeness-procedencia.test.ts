import { describe, expect, it } from 'vitest';
import { procedenciaDeItem } from '../../../src/modules/completeness/completeness.procedencia.js';
import type { ItemDeDatoCritico, RegistroDeDato } from '../../../src/modules/completeness/ports.js';

const DOCUMENTO = '3b8e5a21-6c4d-4e7f-9a10-2c3d4e5f6a7b';

function item(resto: Partial<ItemDeDatoCritico> = {}): ItemDeDatoCritico {
  return {
    key: 're',
    label: 'Receptor de estrógeno',
    cancerType: 'mama',
    destination: { entity: 'Biomarker', field: 'value' },
    minValues: 1,
    ...resto,
  };
}

function registro(
  entryMethod: string,
  resto: {
    reviewStatus?: string;
    sourceDocumentId?: string | null;
    page?: number | null;
  } = {},
): RegistroDeDato {
  return {
    id: 'r-1',
    reviewStatus: resto.reviewStatus ?? 'verificado',
    fecha: null,
    creadoEn: '2026-01-01T00:00:00.000000Z',
    procedencia: {
      entryMethod,
      sourceDocumentId: resto.sourceDocumentId ?? null,
      page: resto.page ?? null,
    },
    columnas: {},
  };
}

describe('procedenciaDeItem', () => {
  it('devuelve origin documento con entryMethod, reviewStatus, sourceDocumentId y page cuando el registro viene de un documento con página', () => {
    const resultado = procedenciaDeItem(
      item(),
      'presente_sin_verificar',
      registro('ocr', {
        reviewStatus: 'requiere_revision',
        sourceDocumentId: DOCUMENTO,
        page: 2,
      }),
    );

    expect(resultado.origin).toBe('documento');
    expect(resultado.provenance).toEqual({
      entryMethod: 'ocr',
      reviewStatus: 'requiere_revision',
      sourceDocumentId: DOCUMENTO,
      page: 2,
    });
  });

  it('devuelve origin manual sin page cuando el registro se capturó a mano', () => {
    const resultado = procedenciaDeItem(item(), 'presente_verificado', registro('manual'));

    expect(resultado.origin).toBe('manual');
    expect(resultado.provenance).toEqual({
      entryMethod: 'manual',
      reviewStatus: 'verificado',
      sourceDocumentId: null,
    });
  });

  it('devuelve origin correccion cuando el registro es una corrección manual', () => {
    const resultado = procedenciaDeItem(
      item(),
      'presente_verificado',
      registro('manual_correction', { reviewStatus: 'corregido' }),
    );

    expect(resultado.origin).toBe('correccion');
    expect(resultado.provenance?.reviewStatus).toBe('corregido');
  });

  it('devuelve origin seed cuando el registro es sintético de seed', () => {
    const resultado = procedenciaDeItem(item(), 'presente_verificado', registro('seed'));

    expect(resultado.origin).toBe('seed');
    expect(resultado.provenance?.entryMethod).toBe('seed');
  });

  it('omite page cuando el registro de documento no trae página', () => {
    const resultado = procedenciaDeItem(
      item(),
      'presente_verificado',
      registro('ocr', { sourceDocumentId: DOCUMENTO, page: null }),
    );

    expect(resultado.provenance).not.toHaveProperty('page');
  });

  it('devuelve origin regla, provenance null y destination del catálogo cuando el ítem es faltante', () => {
    const resultado = procedenciaDeItem(item(), 'faltante', undefined);

    expect(resultado).toEqual({
      origin: 'regla',
      provenance: null,
      destination: { entity: 'Biomarker', field: 'value' },
      condition: null,
    });
  });

  it('devuelve field null cuando el destino es la entidad entera', () => {
    const resultado = procedenciaDeItem(
      item({ destination: { entity: 'PriorTreatment' } }),
      'faltante',
      undefined,
    );

    expect(resultado.destination).toEqual({ entity: 'PriorTreatment', field: null });
  });

  it('devuelve la condición del catálogo cuando el ítem es no_aplica', () => {
    const condicion = { item: 'tnm', operator: 'prefijo', values: ['IV'] } as const;

    const resultado = procedenciaDeItem(item({ condition: condicion }), 'no_aplica', undefined);

    expect(resultado.origin).toBe('regla');
    expect(resultado.provenance).toBeNull();
    expect(resultado.condition).toEqual(condicion);
  });

  it('devuelve condition null cuando el ítem es faltante aunque el catálogo tenga una condición', () => {
    const condicion = { item: 'tnm', operator: 'prefijo', values: ['IV'] } as const;

    const resultado = procedenciaDeItem(item({ condition: condicion }), 'faltante', undefined);

    expect(resultado.condition).toBeNull();
  });

  it('falla cerrado cuando un ítem presente llega sin registro que cuente', () => {
    expect(() => procedenciaDeItem(item(), 'presente_verificado', undefined)).toThrow(
      'registro_ausente',
    );
  });

  it('falla cerrado cuando el registro trae un entryMethod que el contrato no declara', () => {
    expect(() => procedenciaDeItem(item(), 'presente_verificado', registro('importado'))).toThrow(
      'entry_method_desconocido',
    );
  });
});
