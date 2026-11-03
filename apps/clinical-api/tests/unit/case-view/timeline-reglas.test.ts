import { describe, expect, it } from 'vitest';
import type {
  BiomarcadorLeido,
  DatosDelCaso,
  ProcedenciaDeFila,
  TratamientoPrevioLeido,
} from '../../../src/modules/case-view/ports.js';
import {
  eventosDerivados,
  idDeEventoDerivado,
  ordenarTimeline,
  procedenciaDeExamen,
  seriesDeBiomarcadores,
  type EventoConOrden,
} from '../../../src/modules/case-view/timeline.reglas.js';

const MANUAL: ProcedenciaDeFila = {
  entryMethod: 'manual',
  extractionConfidence: 'n_a',
  reviewStatus: 'verificado',
  conflict: false,
  sourceDocumentId: null,
};

const biomarcador = (resto: Partial<BiomarcadorLeido> = {}): BiomarcadorLeido => ({
  examId: 'examen-1',
  examType: 'laboratorio',
  performedAt: '2026-01-10',
  examCreatedAt: '2026-10-01T12:00:00.000000Z',
  examEntryMethod: 'ocr',
  examSourceDocumentId: 'doc-1',
  biomarkerId: 'bio-1',
  name: 'PSA',
  loincCode: null,
  value: '4.1',
  unit: 'ng/mL',
  extractionConfidence: 'alta',
  reviewStatus: 'verificado',
  conflict: false,
  ...resto,
});

const tratamiento = (resto: Partial<TratamientoPrevioLeido> = {}): TratamientoPrevioLeido => ({
  id: 'trat-1',
  lineNumber: 1,
  setting: 'primera_linea_metastasica',
  regimenName: 'Leuprorelina',
  atcCodes: ['L02AE02'],
  cupsCode: null,
  startedAt: '2025-11-01',
  endedAt: null,
  ongoing: true,
  endReason: 'desconocido',
  createdAt: '2026-10-01T12:00:00.000000Z',
  procedencia: MANUAL,
  ...resto,
});

const sinDatos: DatosDelCaso = {
  diagnosticos: [],
  biomarcadores: [],
  tratamientos: [],
  eventos: [],
  atributos: [],
  registrosDeIa: [],
};

const evento = (resto: {
  id: string;
  eventDate: string | null;
  rango: number;
  creadoEn?: string;
}): EventoConOrden => ({
  evento: {
    id: resto.id,
    eventType: 'x',
    derived: true,
    eventDate: resto.eventDate,
    datePrecision: resto.eventDate === null ? 'incierta' : 'dia',
    description: 'x',
    codes: { icd10: null, cups: null },
    provenance: { ...MANUAL, additionalSourceDocumentIds: [] },
  },
  rangoDelOrigen: resto.rango,
  creadoEn: resto.creadoEn ?? '2026-10-01T12:00:00.000000Z',
});

describe('idDeEventoDerivado', () => {
  it('devuelve el mismo uuid v5 cuando se repiten el origen, la fila y el hito', () => {
    const primero = idDeEventoDerivado('prior_treatment', 'trat-1', 'inicio');

    expect(idDeEventoDerivado('prior_treatment', 'trat-1', 'inicio')).toBe(primero);
    expect(primero).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('devuelve ids distintos cuando un tratamiento produce el inicio y el fin', () => {
    expect(idDeEventoDerivado('prior_treatment', 'trat-1', 'inicio')).not.toBe(
      idDeEventoDerivado('prior_treatment', 'trat-1', 'fin'),
    );
  });
});

describe('procedenciaDeExamen', () => {
  it('toma el estado más pendiente de sus biomarcadores cuando mezclan verificado y requiere_revision', () => {
    const resultado = procedenciaDeExamen([
      biomarcador({ reviewStatus: 'verificado' }),
      biomarcador({ biomarkerId: 'bio-2', reviewStatus: 'requiere_revision' }),
    ]);

    expect(resultado.reviewStatus).toBe('requiere_revision');
  });

  it('ordena los estados requiere_revision antes de auto_aceptado, corregido y verificado', () => {
    const estado = (reviewStatus: BiomarcadorLeido['reviewStatus'][]) =>
      procedenciaDeExamen(reviewStatus.map((valor) => biomarcador({ reviewStatus: valor })))
        .reviewStatus;

    expect(estado(['verificado', 'corregido'])).toBe('corregido');
    expect(estado(['corregido', 'auto_aceptado'])).toBe('auto_aceptado');
  });

  it('devuelve los cuatro estados en orden de más a menos pendiente cuando se toman de a uno contra verificado', () => {
    const estado = (reviewStatus: BiomarcadorLeido['reviewStatus'][]) =>
      procedenciaDeExamen(reviewStatus.map((valor) => biomarcador({ reviewStatus: valor })))
        .reviewStatus;

    expect(estado(['verificado', 'requiere_revision', 'corregido', 'auto_aceptado'])).toBe(
      'requiere_revision',
    );
    expect(estado(['verificado', 'corregido', 'auto_aceptado'])).toBe('auto_aceptado');
    expect(estado(['verificado', 'corregido'])).toBe('corregido');
    expect(estado(['verificado'])).toBe('verificado');
  });

  it('toma la confianza más baja cuando mezclan alta y media y n_a solo si todas lo son', () => {
    expect(
      procedenciaDeExamen([
        biomarcador({ extractionConfidence: 'alta' }),
        biomarcador({ extractionConfidence: 'media' }),
      ]).extractionConfidence,
    ).toBe('media');
    expect(
      procedenciaDeExamen([
        biomarcador({ extractionConfidence: 'n_a' }),
        biomarcador({ extractionConfidence: 'alta' }),
      ]).extractionConfidence,
    ).toBe('alta');
    expect(
      procedenciaDeExamen([biomarcador({ extractionConfidence: 'n_a' })]).extractionConfidence,
    ).toBe('n_a');
  });

  it('marca conflicto cuando algún biomarcador está en conflicto y toma método y documento del examen', () => {
    const resultado = procedenciaDeExamen([
      biomarcador(),
      biomarcador({ biomarkerId: 'bio-2', conflict: true }),
    ]);

    expect(resultado).toEqual({
      entryMethod: 'ocr',
      extractionConfidence: 'alta',
      reviewStatus: 'verificado',
      conflict: true,
      sourceDocumentId: 'doc-1',
    });
  });
});

describe('ordenarTimeline', () => {
  it('ordena por fecha ascendente cuando los eventos tienen fechas distintas', () => {
    const orden = ordenarTimeline([
      evento({ id: 'b', eventDate: '2026-02-01', rango: 0 }),
      evento({ id: 'a', eventDate: '2026-01-01', rango: 0 }),
    ]);

    expect(orden.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('desempata por el rango del origen y luego por id cuando comparten fecha', () => {
    const orden = ordenarTimeline([
      evento({ id: 'z-examen', eventDate: '2026-01-01', rango: 3 }),
      evento({ id: 'b-diagnostico', eventDate: '2026-01-01', rango: 0 }),
      evento({ id: 'a-diagnostico', eventDate: '2026-01-01', rango: 0 }),
    ]);

    expect(orden.map((e) => e.id)).toEqual(['a-diagnostico', 'b-diagnostico', 'z-examen']);
  });

  it('deja al final los eventos sin fecha ordenados por creación e id cuando hay fechados', () => {
    const orden = ordenarTimeline([
      evento({ id: 'b', eventDate: null, rango: 4, creadoEn: '2026-10-01T12:00:00.000002Z' }),
      evento({ id: 'a', eventDate: null, rango: 4, creadoEn: '2026-10-01T12:00:00.000002Z' }),
      evento({ id: 'c', eventDate: null, rango: 4, creadoEn: '2026-10-01T12:00:00.000001Z' }),
      evento({ id: 'fechado', eventDate: '2030-01-01', rango: 0 }),
    ]);

    expect(orden.map((e) => e.id)).toEqual(['fechado', 'c', 'a', 'b']);
  });

  it('devuelve lista vacía cuando no hay eventos', () => {
    expect(ordenarTimeline([])).toEqual([]);
  });
});

describe('eventosDerivados', () => {
  it('produce un evento de inicio con eventDate null e incierta cuando el tratamiento no tiene fecha de inicio', () => {
    const eventos = eventosDerivados({
      ...sinDatos,
      tratamientos: [tratamiento({ startedAt: null })],
    });

    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.evento).toMatchObject({
      eventType: 'inicio_tratamiento_previo',
      eventDate: null,
      datePrecision: 'incierta',
    });
  });

  it('produce el evento de fin solo cuando el tratamiento tiene fecha de fin', () => {
    const conFin = eventosDerivados({
      ...sinDatos,
      tratamientos: [tratamiento({ endedAt: '2025-12-01', ongoing: false })],
    });
    const sinFin = eventosDerivados({ ...sinDatos, tratamientos: [tratamiento()] });

    expect(conFin.map((e) => e.evento.eventType)).toEqual([
      'inicio_tratamiento_previo',
      'fin_tratamiento_previo',
    ]);
    expect(sinFin.map((e) => e.evento.eventType)).toEqual(['inicio_tratamiento_previo']);
  });

  it('produce un solo evento de examen cuando el examen tiene varios biomarcadores', () => {
    const eventos = eventosDerivados({
      ...sinDatos,
      biomarcadores: [
        biomarcador(),
        biomarcador({ biomarkerId: 'bio-2', name: 'Testosterona', value: '25' }),
      ],
    });

    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.evento).toMatchObject({
      eventType: 'examen',
      eventDate: '2026-01-10',
      description: 'laboratorio',
      derived: true,
    });
  });

  it('rotula el análisis y el resumen con su tipo, su descripción y la procedencia de IA cuando hay registros de IA', () => {
    const eventos = eventosDerivados({
      ...sinDatos,
      registrosDeIa: [
        {
          id: 'ia-1',
          analysisType: 'analisis_evidencia',
          fecha: '2026-08-01',
          createdAt: '2026-08-01T12:00:00.000000Z',
        },
        {
          id: 'ia-2',
          analysisType: 'resumen_caso',
          fecha: '2026-08-02',
          createdAt: '2026-08-02T12:00:00.000000Z',
        },
      ],
    });

    expect(eventos.map((e) => [e.evento.eventType, e.evento.description])).toEqual([
      ['analisis_ia', 'Análisis de IA'],
      ['resumen_caso', 'Resumen del caso'],
    ]);
    expect(eventos[0]?.evento.provenance).toEqual({
      entryMethod: 'manual',
      extractionConfidence: 'n_a',
      reviewStatus: 'auto_aceptado',
      conflict: false,
      sourceDocumentId: null,
      additionalSourceDocumentIds: [],
    });
  });
});

describe('seriesDeBiomarcadores', () => {
  it('agrupa por nombre en orden alfabético con los puntos por fecha y el loinc del punto más reciente', () => {
    const series = seriesDeBiomarcadores([
      biomarcador({ biomarkerId: 'p2', performedAt: '2026-04-12', value: '6.8', loincCode: 'L-2' }),
      biomarcador({ biomarkerId: 'p1', performedAt: '2026-01-10', value: '4.1', loincCode: 'L-1' }),
      biomarcador({
        biomarkerId: 't1',
        name: 'Testosterona',
        performedAt: '2026-07-15',
        value: '25',
        unit: 'ng/dL',
      }),
    ]);

    expect(series.map((s) => [s.name, s.loincCode, s.points.map((p) => p.value)])).toEqual([
      ['PSA', 'L-2', ['4.1', '6.8']],
      ['Testosterona', null, ['25']],
    ]);
    expect(series[0]?.points[0]?.provenance.additionalSourceDocumentIds).toEqual([]);
  });
});
