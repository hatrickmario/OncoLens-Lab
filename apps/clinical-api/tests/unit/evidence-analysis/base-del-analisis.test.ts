import { describe, expect, it } from 'vitest';
import reescrituraAplicada from '../../../../../contracts/examples/rag-query-reescritura-aplicada.json' with { type: 'json' };
import conEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import sinEvidencia from '../../../../../contracts/examples/rag-query-sin-evidencia.json' with { type: 'json' };
import peticion from '../../../../../contracts/examples/rag-query-request.json' with { type: 'json' };
import {
  construirBaseTipoNoHabilitado,
  crearBaseDelAnalisis,
  declararReescrituraEnLaBase,
  etiquetarFaltantes,
} from '../../../src/modules/evidence-analysis/analysis-basis.js';
import { validarRespuestaInterna } from '../../../src/modules/evidence-analysis/analysis-completion.js';
import { EtiquetaDeDatoCriticoNoDisponibleError } from '../../../src/modules/evidence-analysis/ports.js';
import type { RagQueryInternalRequest } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';

const request = peticion as RagQueryInternalRequest;
const respuestaConEvidencia = () => validarRespuestaInterna(conEvidencia);

describe('declararReescrituraEnLaBase (US-238, D-d)', () => {
  const conQueryRewrite = (
    status: 'con_evidencia' | 'sin_evidencia',
    queryRewrite: { applied: boolean; reason: string },
  ) => {
    const respuesta = validarRespuestaInterna(
      status === 'con_evidencia' ? conEvidencia : sinEvidencia,
    );
    respuesta.meta.retrievalParams.queryRewrite = queryRewrite as never;
    return respuesta;
  };

  it('es verdadero solo con applied verdadero y con_evidencia [US-238 AC-1]', () => {
    expect(declararReescrituraEnLaBase(validarRespuestaInterna(reescrituraAplicada))).toBe(true);
  });

  it.each([
    ['con_evidencia', { applied: false, reason: 'no_disparado' }],
    ['con_evidencia', { applied: false, reason: 'no_disponible' }],
    ['sin_evidencia', { applied: true, reason: 'disparado' }],
    ['sin_evidencia', { applied: false, reason: 'no_disponible' }],
  ] as const)('es falso con %s y %j', (status, queryRewrite) => {
    expect(declararReescrituraEnLaBase(conQueryRewrite(status, queryRewrite))).toBe(false);
  });
});

describe('BaseDelAnalisis', () => {
  const base = crearBaseDelAnalisis({ etiquetaDe: (clave) => clave });

  it('produce la misma Base byte a byte cuando se ejecuta dos veces con las mismas entradas [US-066 AC-4]', () => {
    const primera = base.construir(request, respuestaConEvidencia(), false);
    const segunda = base.construir(structuredClone(request), respuestaConEvidencia(), false);

    expect(primera.patientDataUsed.length).toBeGreaterThan(0);
    expect(JSON.stringify(segunda)).toBe(JSON.stringify(primera));
  });

  it('declara las fuentes seleccionadas, los filtros efectivos y los conteos de la recuperación', () => {
    const resultado = base.construir(request, respuestaConEvidencia(), false);

    expect(resultado.sourcesConsulted).toEqual({
      selected: ['guias', 'publicaciones'],
      filters: request.filtersApplied,
      retrieved: 40,
      aboveThreshold: 1,
      queryRewritten: false,
    });
  });

  it('copia de la respuesta las fuentes no incluidas, la fecha de corte, las limitaciones, los pasos del agente y las afirmaciones omitidas', () => {
    const resultado = base.construir(request, respuestaConEvidencia(), false);

    expect(resultado).toMatchObject({
      sourcesNotIncluded: ['NCCN', 'ESMO'],
      corpusCutoffDate: '2026-09-30',
      limitations: [{ text: 'Síntesis basada en una sola fuente.', origin: 'estructural' }],
      agentSteps: [],
      omittedClaims: 0,
    });
  });

  it('deja vacío priorAnalysesUsed', () => {
    const resultado = base.construir(request, respuestaConEvidencia(), false);

    expect(resultado.priorAnalysesUsed).toEqual([]);
  });

  it('refleja continueWithWarning en continuedWithWarning', () => {
    const respuesta = respuestaConEvidencia();

    expect(base.construir(request, respuesta, true).continuedWithWarning).toBe(true);
    expect(base.construir(request, respuesta, false).continuedWithWarning).toBe(false);
  });

  it('no declara supuestos cuando la respuesta no trae supuestos', () => {
    const resultado = base.construir(request, validarRespuestaInterna(sinEvidencia), false);

    expect(resultado.assumptions).toEqual([]);
  });

  it('declara solo los supuestos verificados de la respuesta', () => {
    const respuesta = validarRespuestaInterna({
      ...structuredClone(conEvidencia),
      assumptions: [{ text: 'Supuesto sintético del modelo.' }],
    });

    const resultado = base.construir(request, respuesta, false);

    expect(resultado.assumptions).toEqual([
      { text: 'Supuesto sintético del modelo.', origin: 'llm_verificado' },
    ]);
  });

  it('lista los datos del contexto en el orden de su dataRef con los ejes de revisión de su procedencia', () => {
    const resultado = base.construir(request, respuestaConEvidencia(), false);

    expect(resultado.patientDataUsed).toEqual([
      { label: 'mama · TNM_8 IIA', reviewStatus: 'verificado', conflict: false },
      { label: 'HER2 3+ (IHQ)', reviewStatus: 'auto_aceptado', conflict: false },
      {
        label: 'RE Positivo (80%)',
        reviewStatus: 'requiere_revision',
        conflict: false,
      },
      { label: 'diagnostico', reviewStatus: 'verificado', conflict: false },
    ]);
  });

  it('deja patientDataUsed vacío cuando el contexto no trae datos', () => {
    const contexto = {
      ...request.clinicalContext,
      diagnosis: null,
      biomarkers: [],
      attributes: [],
      priorTreatments: [],
      events: [],
    };

    const resultado = base.construir(
      { ...request, clinicalContext: contexto },
      respuestaConEvidencia(),
      false,
    );

    expect(resultado.patientDataUsed).toEqual([]);
  });

  it('no escribe en las etiquetas el pseudoPatientId ni los dataRef del contexto', () => {
    const resultado = base.construir(request, respuestaConEvidencia(), false);

    const etiquetas = resultado.patientDataUsed.map(({ label }) => label).join('|');
    expect(etiquetas).not.toContain(request.clinicalContext.pseudoPatientId);
    expect(etiquetas).not.toMatch(/\br\d+\b/);
  });
});

describe('construirBaseTipoNoHabilitado', () => {
  const entrada = {
    sourcesSelected: { guias: true, ensayos: false, publicaciones: true },
    filters: request.filtersApplied,
    continuedWithWarning: false,
    sourcesNotIncluded: ['NCCN', 'ESMO'],
    corpusCutoffDate: '2026-09-30',
  };

  it('declara las fuentes y los filtros de la petición con 0 recuperados y 0 sobre el umbral', () => {
    expect(construirBaseTipoNoHabilitado(entrada).sourcesConsulted).toEqual({
      selected: ['guias', 'publicaciones'],
      filters: request.filtersApplied,
      retrieved: 0,
      aboveThreshold: 0,
      queryRewritten: false,
    });
  });

  it('declara que no se envió ningún dato del paciente, las fuentes excluidas, la fecha de corte y la limitación estructural, con todo lo demás vacío', () => {
    expect(construirBaseTipoNoHabilitado(entrada)).toMatchObject({
      patientDataUsed: [],
      missingCriticalData: [],
      missingCriticalDataLabels: [],
      continuedWithWarning: false,
      assumptions: [],
      sourcesNotIncluded: ['NCCN', 'ESMO'],
      corpusCutoffDate: '2026-09-30',
      limitations: [
        { text: 'El tipo de cáncer no está habilitado en este entorno.', origin: 'estructural' },
      ],
      priorAnalysesUsed: [],
      agentSteps: [],
      omittedClaims: 0,
    });
  });

  it('no comparte referencias con la configuración: modificar la Base no altera la lista de fuentes excluidas', () => {
    const excluidas = ['NCCN'];
    const base = construirBaseTipoNoHabilitado({ ...entrada, sourcesNotIncluded: excluidas });

    base.sourcesNotIncluded.push('otra');

    expect(excluidas).toEqual(['NCCN']);
  });

  it('copia continuedWithWarning de la petición', () => {
    expect(
      construirBaseTipoNoHabilitado({ ...entrada, continuedWithWarning: true })
        .continuedWithWarning,
    ).toBe(true);
  });
});

describe('inciso (b) de la Base', () => {
  const etiquetas: Record<string, string> = {
    ki67: 'Ki-67',
    grado: 'Grado histológico',
    rp: 'Receptor de progesterona',
  };
  const base = crearBaseDelAnalisis({ etiquetaDe: (clave) => etiquetas[clave] });
  const conFaltantes = (faltantes: string[]): RagQueryInternalRequest => ({
    ...request,
    clinicalContext: { ...request.clinicalContext, missingCriticalData: faltantes },
  });

  it('declara listas vacías cuando el request no trae faltantes', () => {
    const resultado = base.construir(conFaltantes([]), respuestaConEvidencia(), false);

    expect(resultado.missingCriticalData).toEqual([]);
    expect(resultado.missingCriticalDataLabels).toEqual([]);
  });

  it('conserva el orden de las claves y pone cada etiqueta en la misma posición cuando hay varios faltantes', () => {
    const resultado = base.construir(
      conFaltantes(['rp', 'ki67', 'grado']),
      respuestaConEvidencia(),
      true,
    );

    expect(resultado.missingCriticalData).toEqual(['rp', 'ki67', 'grado']);
    expect(resultado.missingCriticalDataLabels).toEqual([
      'Receptor de progesterona',
      'Ki-67',
      'Grado histológico',
    ]);
  });

  it('copia la lista sin compartir el arreglo del request', () => {
    const entrada = conFaltantes(['ki67']);

    const resultado = base.construir(entrada, respuestaConEvidencia(), false);

    expect(resultado.missingCriticalData).not.toBe(entrada.clinicalContext.missingCriticalData);
  });

  it('lanza EtiquetaDeDatoCriticoNoDisponibleError sin nombrar la clave cuando el catálogo no la conoce', () => {
    const construir = () =>
      base.construir(conFaltantes(['ki67', 'clave_desconocida']), respuestaConEvidencia(), false);

    expect(construir).toThrow(EtiquetaDeDatoCriticoNoDisponibleError);
    expect(construir).not.toThrow(/clave_desconocida/);
  });

  it('produce la misma Base byte a byte cuando se repite con los mismos faltantes [US-066 AC-4]', () => {
    const primera = base.construir(conFaltantes(['rp', 'ki67']), respuestaConEvidencia(), true);
    const segunda = base.construir(conFaltantes(['rp', 'ki67']), respuestaConEvidencia(), true);

    expect(JSON.stringify(segunda)).toBe(JSON.stringify(primera));
  });
});

describe('etiquetarFaltantes', () => {
  it('devuelve un arreglo vacío cuando no hay claves', () => {
    expect(etiquetarFaltantes([], () => undefined)).toEqual([]);
  });
});
