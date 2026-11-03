import { describe, expect, it } from 'vitest';
import conEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import peticion from '../../../../../contracts/examples/rag-query-request.json' with { type: 'json' };
import type { RagQueryInternalRequest } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { crearBaseDelAnalisis } from '../../../src/modules/evidence-analysis/analysis-basis.js';
import { validarRespuestaInterna } from '../../../src/modules/evidence-analysis/analysis-completion.js';
import { armarRegistro } from '../../../src/modules/evidence-analysis/analysis-record.js';
import type { FilaDeEvento } from '../../../src/modules/evidence-analysis/evidence-analysis.repository.js';
import {
  armarRagFollowUpRequest,
  contextoConMemoria,
  memoriaDelAnalisis,
} from '../../../src/modules/evidence-analysis/follow-up.request.js';

const ANALISIS_CREADO = new Date('2026-07-16T12:00:00.000Z');
const AHORA = new Date('2026-10-16T12:00:00.000Z');
const request = peticion as RagQueryInternalRequest;
const respuesta = validarRespuestaInterna(conEvidencia);
const registro = armarRegistro({
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  creadoEn: ANALISIS_CREADO,
  traceId: 'req_Analisis01',
  patientId: 'paciente-sintetico',
  episodeId: 'episodio-sintetico',
  userId: 'usuario-sintetico',
  questionTemplateId: null,
  continueWithWarning: false,
  request,
  dataRefs: new Map(),
  respuesta,
  base: crearBaseDelAnalisis({ etiquetaDe: (clave) => clave, maxFollowUps: 10 }).construir(
    request,
    respuesta,
    false,
  ),
  topRelevanceScore: 0.87,
});
const evento = (resto: Partial<FilaDeEvento> = {}): FilaDeEvento => ({
  id: 'ev-1',
  eventType: 'evolucion',
  eventDate: '2026-09-16',
  description: 'Control sin hallazgos nuevos',
  entryMethod: 'manual',
  extractionConfidence: 'n_a',
  reviewStatus: 'verificado',
  conflictsWithId: null,
  ...resto,
});

describe('memoriaDelAnalisis', () => {
  it('rotula el análisis como memoria no citable con su pregunta y los títulos de sus opciones (RN-24)', () => {
    const memoria = memoriaDelAnalisis(registro, [], AHORA);

    expect(memoria).toMatchObject({
      source: 'analisis_previo_ia',
      citable: false,
      question: registro.queryText,
      optionsDescribed: registro.evidenceOptions.map((opcion) => opcion.option),
      linkedDecision: null,
      outcomesSince: [],
    });
  });

  it('mide monthsAgo con el reloj inyectado: tres meses entre la creación del análisis y ahora', () => {
    expect(memoriaDelAnalisis(registro, [], AHORA).monthsAgo).toBe(3);
  });

  it('resume la síntesis con el texto de sus afirmaciones, sin identificadores ni citas', () => {
    const { synthesisSummary } = memoriaDelAnalisis(registro, [], AHORA);

    for (const { text } of registro.synthesis.agreements) expect(synthesisSummary).toContain(text);
  });

  it('copia la evolución posterior con meses relativos y sin fechas absolutas', () => {
    const memoria = memoriaDelAnalisis(
      registro,
      [evento(), evento({ id: 'ev-2', eventDate: null })],
      AHORA,
    );

    expect(memoria.outcomesSince).toEqual([
      { eventType: 'evolucion', monthsAgo: 1, description: 'Control sin hallazgos nuevos' },
      { eventType: 'evolucion', monthsAgo: 0, description: 'Control sin hallazgos nuevos' },
    ]);
  });
});

describe('armarRagFollowUpRequest', () => {
  const memoria = memoriaDelAnalisis(registro, [], AHORA);
  const clinicalContext = {
    ...contextoConMemoria(registro, memoria),
    pseudoPatientId: 'psd_NuevoDelTurno',
  };
  const armado = armarRagFollowUpRequest({
    traceId: 'req_TurnoNuevo01',
    catalogVersion: '2026.10.0',
    question: 'pregunta enmascarada',
    registro,
    clinicalContext,
  });

  it('lleva el seudónimo y el traceId del turno, la pregunta y los filtros y la clasificación del análisis', () => {
    expect(armado).toMatchObject({
      traceId: 'req_TurnoNuevo01',
      catalogVersion: '2026.10.0',
      question: 'pregunta enmascarada',
      dataClassification: registro.dataClassification,
      filtersApplied: registro.filtersApplied,
    });
    expect(armado.clinicalContext.pseudoPatientId).toBe('psd_NuevoDelTurno');
  });

  it('mueve la memoria de priorAnalyses del contexto a analysisMemory', () => {
    expect(armado.analysisMemory).toEqual([memoria]);
    expect(armado.clinicalContext.priorAnalyses).toEqual([]);
  });
});

describe('contextoConMemoria', () => {
  it('parte del snapshot del análisis (sin seudónimo) y añade la memoria en priorAnalyses', () => {
    const memoria = memoriaDelAnalisis(registro, [], AHORA);

    const contexto = contextoConMemoria(registro, memoria);

    expect(contexto).toEqual({ ...registro.clinicalContextSnapshot, priorAnalyses: [memoria] });
    expect(contexto).not.toHaveProperty('pseudoPatientId');
  });
});
