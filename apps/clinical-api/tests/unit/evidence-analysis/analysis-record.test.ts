import { describe, expect, it } from 'vitest';
import conEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import peticion from '../../../../../contracts/examples/rag-query-request.json' with { type: 'json' };
import type { RagQueryInternalRequest } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import {
  construirBaseTipoNoHabilitado,
  crearBaseDelAnalisis,
} from '../../../src/modules/evidence-analysis/analysis-basis.js';
import { validarRespuestaInterna } from '../../../src/modules/evidence-analysis/analysis-completion.js';
import {
  armarRegistro,
  armarRegistroTipoNoHabilitado,
  huellaDelContexto,
  type EntradaDelRegistro,
  type EntradaDelRegistroSinIA,
} from '../../../src/modules/evidence-analysis/analysis-record.js';

const AHORA = new Date('2026-10-16T12:00:00.000Z');
const request = peticion as RagQueryInternalRequest;
const respuesta = validarRespuestaInterna(conEvidencia);
const base = crearBaseDelAnalisis({ etiquetaDe: (clave) => clave }).construir(
  request,
  respuesta,
  true,
);

function entrada(resto: Partial<EntradaDelRegistro> = {}): EntradaDelRegistro {
  return {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    creadoEn: AHORA,
    traceId: 'req_Fijo0001',
    patientId: 'paciente-sintetico',
    episodeId: 'episodio-sintetico',
    userId: 'usuario-sintetico',
    questionTemplateId: 'mama.adyuvancia.her2',
    continueWithWarning: true,
    request,
    dataRefs: new Map([
      ['r10', { tabla: 'biomarker', id: 'bm-10' }],
      ['r2', { tabla: 'biomarker', id: 'bm-2' }],
      ['r1', { tabla: 'diagnosis', id: 'dx-1' }],
    ]),
    respuesta,
    base,
    topRelevanceScore: 0.87,
    ...resto,
  };
}

describe('armarRegistro', () => {
  it('persiste como missingCriticalData exactamente la lista enviada en el contexto del request', () => {
    const conFaltantes: RagQueryInternalRequest = {
      ...request,
      clinicalContext: { ...request.clinicalContext, missingCriticalData: ['grado', 'rp'] },
    };

    const registro = armarRegistro(entrada({ request: conFaltantes }));

    expect(registro.missingCriticalData).toEqual(['grado', 'rp']);
  });

  it('copia identificadores, trazabilidad y tiempo: el id y la hora vienen inyectados y el traceId es el generado', () => {
    const registro = armarRegistro(entrada());

    expect(registro).toMatchObject({
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      createdAt: AHORA,
      traceId: 'req_Fijo0001',
      patientId: 'paciente-sintetico',
      episodeId: 'episodio-sintetico',
      requestedBy: 'usuario-sintetico',
      analysisType: 'analisis_evidencia',
      questionTemplateId: 'mama.adyuvancia.her2',
      continuedWithWarning: true,
      rerunOfAnalysisId: null,
      caseSummary: null,
    });
  });

  it('guarda la pregunta desidentificada del request, las fuentes y los filtros efectivos', () => {
    const registro = armarRegistro(entrada());

    expect(registro.queryText).toBe(request.query);
    expect(registro.sourcesSelected).toEqual(request.sourcesSelected);
    expect(registro.filtersApplied).toEqual(request.filtersApplied);
    expect(registro.dataClassification).toBe('sintetico');
  });

  it('guarda el snapshot del contexto sin pseudoPatientId', () => {
    const registro = armarRegistro(entrada());

    expect(registro.clinicalContextSnapshot).not.toHaveProperty('pseudoPatientId');
    expect(registro.clinicalContextSnapshot).toMatchObject({
      population: 'adulto',
      diagnosis: request.clinicalContext.diagnosis,
    });
    expect(JSON.stringify(registro)).not.toContain(request.clinicalContext.pseudoPatientId);
  });

  it('copia el contenido del análisis y el puntaje recibidos sin recalcularlos', () => {
    const registro = armarRegistro(entrada());

    expect(registro).toMatchObject({
      status: 'con_evidencia',
      topRelevanceScore: 0.87,
      synthesis: respuesta.synthesis,
      applicability: respuesta.applicability,
      evidenceOptions: respuesta.evidenceOptions,
      discardedOptions: respuesta.discardedOptions,
      analysisBasis: base,
      agentSteps: [],
      omittedClaims: 0,
      missingCriticalData: ['estado_menopausico', 'ki67'],
      priorAnalysesUsed: [],
    });
  });

  it('toma de meta los idiomas, los modelos, la versión del prompt, del corpus y del catálogo y los parámetros de recuperación', () => {
    const registro = armarRegistro(entrada());

    expect(registro).toMatchObject({
      queryLanguage: 'es',
      responseLanguage: 'es',
      llmProvider: 'local',
      llmModel: 'llm-local-ejemplo',
      embeddingModel: 'embedding-local-ejemplo',
      rerankerModel: 'reranker-local-ejemplo',
      nliModel: 'nli-local-ejemplo',
      promptVersion: 'rag-query@0.1.0',
      corpusRelease: '2026-09-30',
      catalogVersion: '2026.10.0',
      retrievalParams: respuesta.meta.retrievalParams,
    });
  });

  it('resuelve las referencias rN en enlaces ordenados numéricamente', () => {
    const registro = armarRegistro(entrada());

    expect(registro.patientDataLinks).toEqual([
      { dataRef: 'r1', entityType: 'diagnosis', entityId: 'dx-1' },
      { dataRef: 'r2', entityType: 'biomarker', entityId: 'bm-2' },
      { dataRef: 'r10', entityType: 'biomarker', entityId: 'bm-10' },
    ]);
  });

  it('conserva null en topRelevanceScore cuando no hay evidencia (null no es 0)', () => {
    const registro = armarRegistro(entrada({ topRelevanceScore: null }));

    expect(registro.topRelevanceScore).toBeNull();
  });

  it('calcula la huella del snapshot persistido', () => {
    const registro = armarRegistro(entrada());

    expect(registro.contextFingerprint).toBe(huellaDelContexto(registro.clinicalContextSnapshot));
  });
});

describe('huellaDelContexto', () => {
  it('devuelve un SHA-256 hexadecimal', () => {
    expect(huellaDelContexto({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('da la misma huella cuando solo cambia el orden de las claves, a cualquier profundidad', () => {
    const uno = huellaDelContexto({ a: 1, b: { c: [1, { d: 2, e: 3 }], f: null } });
    const otro = huellaDelContexto({ b: { f: null, c: [1, { e: 3, d: 2 }] }, a: 1 });

    expect(otro).toBe(uno);
  });

  it('da huellas distintas cuando cambia un valor', () => {
    expect(huellaDelContexto({ a: 1 })).not.toBe(huellaDelContexto({ a: 2 }));
  });

  it('distingue el orden de los elementos de una lista', () => {
    expect(huellaDelContexto({ a: [1, 2] })).not.toBe(huellaDelContexto({ a: [2, 1] }));
  });
});

describe('armarRegistroTipoNoHabilitado', () => {
  it('deja missingCriticalData vacío en el tipo no habilitado porque no calcula el checklist', () => {
    const registro = armarRegistroTipoNoHabilitado(entradaSinIA());

    expect(registro.missingCriticalData).toEqual([]);
  });

  const baseSinIA = construirBaseTipoNoHabilitado({
    sourcesSelected: request.sourcesSelected,
    filters: request.filtersApplied,
    continuedWithWarning: false,
    sourcesNotIncluded: ['NCCN', 'ESMO'],
    corpusCutoffDate: '2026-09-30',
  });
  const contextoVacio: EntradaDelRegistroSinIA['contextoVacio'] = {
    population: 'adulto',
    diagnosis: null,
    biomarkers: [],
    clinicalNotes: [],
    currentLine: null,
    attributes: [],
    priorTreatments: [],
    events: [],
    biomarkerTrends: [],
    missingCriticalData: [],
    priorAnalyses: [],
  };

  function entradaSinIA(resto: Partial<EntradaDelRegistroSinIA> = {}): EntradaDelRegistroSinIA {
    return {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      creadoEn: AHORA,
      traceId: 'req_Fijo0001',
      patientId: 'paciente-sintetico',
      episodeId: 'episodio-sintetico',
      userId: 'usuario-sintetico',
      questionTemplateId: null,
      continueWithWarning: false,
      query: request.query,
      sourcesSelected: request.sourcesSelected,
      filtersApplied: request.filtersApplied,
      dataClassification: 'sintetico',
      catalogVersion: '2026.10.0',
      contextoVacio,
      base: baseSinIA,
      ...resto,
    };
  }

  it('arma un registro tipo_no_habilitado sin opciones, sin puntaje (null, no 0) y sin enlaces a datos del paciente', () => {
    const registro = armarRegistroTipoNoHabilitado(entradaSinIA());

    expect(registro).toMatchObject({
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      createdAt: AHORA,
      analysisType: 'analisis_evidencia',
      status: 'tipo_no_habilitado',
      topRelevanceScore: null,
      synthesis: { agreements: [], discrepancies: [] },
      applicability: [],
      evidenceOptions: [],
      discardedOptions: [],
      patientDataLinks: [],
      omittedClaims: 0,
      agentSteps: [],
      analysisBasis: baseSinIA,
    });
  });

  it('deja en null modelos, versión del prompt, corpus y parámetros de recuperación: no se invocó ningún modelo', () => {
    const registro = armarRegistroTipoNoHabilitado(entradaSinIA());

    expect(registro).toMatchObject({
      llmProvider: null,
      llmModel: null,
      embeddingModel: null,
      rerankerModel: null,
      nliModel: null,
      promptVersion: null,
      corpusRelease: null,
      retrievalParams: null,
      catalogVersion: '2026.10.0',
    });
  });

  it('guarda la pregunta ya desidentificada, las fuentes, los filtros y la huella del contexto vacío', () => {
    const registro = armarRegistroTipoNoHabilitado(entradaSinIA({ query: 'pregunta enmascarada' }));

    expect(registro.queryText).toBe('pregunta enmascarada');
    expect(registro.sourcesSelected).toEqual(request.sourcesSelected);
    expect(registro.filtersApplied).toEqual(request.filtersApplied);
    expect(registro.clinicalContextSnapshot).toEqual(contextoVacio);
    expect(registro.contextFingerprint).toBe(huellaDelContexto(contextoVacio));
  });
});
