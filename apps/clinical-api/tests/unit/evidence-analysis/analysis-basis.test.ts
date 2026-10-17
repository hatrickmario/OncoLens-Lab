import { describe, expect, it } from 'vitest';
import conEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import sinEvidencia from '../../../../../contracts/examples/rag-query-sin-evidencia.json' with { type: 'json' };
import peticion from '../../../../../contracts/examples/rag-query-request.json' with { type: 'json' };
import { crearBaseDelAnalisisS1 } from '../../../src/modules/evidence-analysis/analysis-basis.js';
import { validarRespuestaInterna } from '../../../src/modules/evidence-analysis/analysis-completion.js';
import type { RagQueryInternalRequest } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';

const SUPUESTO = 'Supuesto fijo sintético de configuración.';
const request = peticion as RagQueryInternalRequest;
const base = crearBaseDelAnalisisS1({ textoDelSupuesto: SUPUESTO });

describe('BaseDelAnalisisS1', () => {
  it('declara las fuentes seleccionadas, los filtros efectivos y los conteos de la recuperación', () => {
    const resultado = base.construir(request, validarRespuestaInterna(conEvidencia), false);

    expect(resultado.sourcesConsulted).toEqual({
      selected: ['guias', 'publicaciones'],
      filters: request.filtersApplied,
      retrieved: 40,
      aboveThreshold: 1,
    });
  });

  it('copia de la respuesta las fuentes no incluidas, la fecha de corte, las limitaciones, los pasos del agente y las afirmaciones omitidas', () => {
    const resultado = base.construir(request, validarRespuestaInterna(conEvidencia), false);

    expect(resultado).toMatchObject({
      sourcesNotIncluded: ['NCCN', 'ESMO'],
      corpusCutoffDate: '2026-09-30',
      limitations: [{ text: 'Síntesis basada en una sola fuente.', origin: 'estructural' }],
      agentSteps: [],
      omittedClaims: 0,
    });
  });

  it('deja vacíos patientDataUsed, missingCriticalData y priorAnalysesUsed en el S1', () => {
    const resultado = base.construir(request, validarRespuestaInterna(conEvidencia), false);

    expect(resultado.patientDataUsed).toEqual([]);
    expect(resultado.missingCriticalData).toEqual([]);
    expect(resultado.priorAnalysesUsed).toEqual([]);
  });

  it('refleja continueWithWarning en continuedWithWarning', () => {
    const respuesta = validarRespuestaInterna(conEvidencia);

    expect(base.construir(request, respuesta, true).continuedWithWarning).toBe(true);
    expect(base.construir(request, respuesta, false).continuedWithWarning).toBe(false);
  });

  it('añade al final de assumptions el supuesto fijo con origen regla_catalogo', () => {
    const resultado = base.construir(request, validarRespuestaInterna(sinEvidencia), false);

    expect(resultado.assumptions).toEqual([{ text: SUPUESTO, origin: 'regla_catalogo' }]);
  });

  it('marca como llm_verificado los supuestos que trae la respuesta y deja el fijo en último lugar', () => {
    const respuesta = validarRespuestaInterna({
      ...structuredClone(conEvidencia),
      assumptions: [{ text: 'Supuesto sintético del modelo.' }],
    });

    const resultado = base.construir(request, respuesta, false);

    expect(resultado.assumptions).toEqual([
      { text: 'Supuesto sintético del modelo.', origin: 'llm_verificado' },
      { text: SUPUESTO, origin: 'regla_catalogo' },
    ]);
  });
});
