import { describe, expect, it } from 'vitest';
import conEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import sinEvidencia from '../../../../../contracts/examples/rag-query-sin-evidencia.json' with { type: 'json' };
import peticion from '../../../../../contracts/examples/rag-query-request.json' with { type: 'json' };
import type { RagQueryInternalRequest } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { crearBaseDelAnalisis } from '../../../src/modules/evidence-analysis/analysis-basis.js';
import { validarRespuestaInterna } from '../../../src/modules/evidence-analysis/analysis-completion.js';
import { armarRegistro } from '../../../src/modules/evidence-analysis/analysis-record.js';
import { aEvidenceAnalysis } from '../../../src/modules/evidence-analysis/evidence-analysis.mapper.js';

const request = peticion as RagQueryInternalRequest;
const DISCLAIMER = 'Aviso sintético de test.';

function registroDe(cuerpo: unknown, topRelevanceScore: number | null) {
  const respuesta = validarRespuestaInterna(structuredClone(cuerpo));
  return armarRegistro({
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    creadoEn: new Date('2026-10-16T12:00:00.000Z'),
    traceId: 'req_Fijo0001',
    patientId: 'paciente-sintetico',
    episodeId: 'episodio-sintetico',
    userId: 'usuario-sintetico',
    questionTemplateId: null,
    continueWithWarning: false,
    request,
    dataRefs: new Map([['r1', { tabla: 'diagnosis', id: 'dx-1' }]]),
    respuesta,
    base: crearBaseDelAnalisis().construir(request, respuesta, false),
    topRelevanceScore,
  });
}

describe('aEvidenceAnalysis', () => {
  it('construye la respuesta con lo persistido: id, traceId, pregunta, estado, contenido y puntaje', () => {
    const registro = registroDe(conEvidencia, 0.87);

    const analisis = aEvidenceAnalysis(registro, DISCLAIMER);

    expect(analisis).toMatchObject({
      id: registro.id,
      traceId: 'req_Fijo0001',
      queryText: registro.queryText,
      questionTemplateId: null,
      queryLanguage: 'es',
      status: 'con_evidencia',
      synthesis: registro.synthesis,
      applicability: registro.applicability,
      evidenceOptions: registro.evidenceOptions,
      discardedOptions: registro.discardedOptions,
      analysisBasis: registro.analysisBasis,
      topRelevanceScore: 0.87,
      patientDataLinks: [{ dataRef: 'r1', entityType: 'diagnosis', entityId: 'dx-1' }],
    });
  });

  it('conserva null en topRelevanceScore y deja evidenceOptions vacío cuando no hay evidencia', () => {
    const analisis = aEvidenceAnalysis(registroDe(sinEvidencia, null), DISCLAIMER);

    expect(analisis.status).toBe('sin_evidencia');
    expect(analisis.topRelevanceScore).toBeNull();
    expect(analisis.evidenceOptions).toEqual([]);
  });

  it('pone el disclaimer recibido de la configuración', () => {
    expect(aEvidenceAnalysis(registroDe(conEvidencia, 0.87), DISCLAIMER).disclaimer).toBe(
      DISCLAIMER,
    );
  });

  it('entrega la vigencia neutra de un análisis nuevo y la fecha de creación en ISO 8601', () => {
    const analisis = aEvidenceAnalysis(registroDe(conEvidencia, 0.87), DISCLAIMER);

    expect(analisis.staleness).toEqual({
      patientData: false,
      changedData: [],
      newerEvidenceOrCatalog: false,
    });
    expect(analisis.rerunOfAnalysisId).toBeNull();
    expect(analisis.createdAt).toBe('2026-10-16T12:00:00.000Z');
  });
});
