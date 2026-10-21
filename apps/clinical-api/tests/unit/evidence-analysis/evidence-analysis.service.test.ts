import { afterEach, describe, expect, it, vi } from 'vitest';
import { TipoCancerNoRegistradoError } from '../../../src/modules/evidence-analysis/case-guards.js';
import {
  PacienteNoEncontradoError,
  armarRagQueryRequest,
  calcularDeadline,
  crearEvidenceAnalysisService,
  type DependenciasDelService,
} from '../../../src/modules/evidence-analysis/evidence-analysis.service.js';
import { crearTiposHabilitados } from '../../../src/modules/evidence-analysis/tipos-habilitados.js';
import { EntornoNoSintetico } from '../../../src/modules/evidence-analysis/deidentification/entorno-sintetico.guard.js';
import type {
  ClinicalContext,
  RagQueryInternalRequest,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type {
  EntradaDeCierre,
  EntradaDeCierreSinIA,
  EntradaDeDesidentificacion,
  OpcionesDeConsultaRag,
} from '../../../src/modules/evidence-analysis/ports.js';
import { AHORA_DE_EJEMPLO, casoDeEjemplo } from './casos.js';

const FUENTES = { guias: true, ensayos: false, publicaciones: true } as const;
const CONTEXTO: ClinicalContext = {
  pseudoPatientId: 'psd_Fijo0001',
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

const RESULTADO_DEL_CIERRE = {
  tipo: 'fallo',
  respuesta: { status: 502, codigo: 'ERROR_SERVICIO_IA', resultado: 'error_servicio_ia' },
} as const;

const entradaBase = {
  traceId: 'req_Fijo0001',
  query: 'pregunta sintética',
  sourcesSelected: FUENTES,
  dataClassification: 'sintetico' as const,
  catalogVersion: '1.0.0',
  maxOptions: 1,
  clinicalContext: CONTEXTO,
  anioActual: 2026,
  aniosPorDefecto: 10,
};

describe('armarRagQueryRequest', () => {
  it('copia traceId, query, fuentes, clasificación, versión de catálogo, maxOptions y contexto', () => {
    const request = armarRagQueryRequest({ ...entradaBase, filtros: undefined });

    expect(request).toMatchObject({
      traceId: 'req_Fijo0001',
      query: 'pregunta sintética',
      sourcesSelected: FUENTES,
      dataClassification: 'sintetico',
      catalogVersion: '1.0.0',
      maxOptions: 1,
      clinicalContext: CONTEXTO,
    });
  });

  it('resuelve los cuatro booleanos en false y el año por defecto cuando la petición no trae filtros', () => {
    const request = armarRagQueryRequest({ ...entradaBase, filtros: undefined });

    expect(request.filtersApplied).toEqual({
      historiaCompleta: false,
      soloBiomarcadoresRelevantes: false,
      ultimosSeisMeses: false,
      antecedentesFamiliares: false,
      publishedFromYear: 2016,
    });
  });

  it('respeta los booleanos recibidos y completa con false los que faltan', () => {
    const request = armarRagQueryRequest({
      ...entradaBase,
      filtros: { ultimosSeisMeses: true },
    });

    expect(request.filtersApplied).toMatchObject({
      ultimosSeisMeses: true,
      historiaCompleta: false,
    });
  });

  it('conserva null en publishedFromYear porque null significa toda la evidencia', () => {
    const request = armarRagQueryRequest({
      ...entradaBase,
      filtros: { publishedFromYear: null },
    });

    expect(request.filtersApplied.publishedFromYear).toBeNull();
  });

  it('conserva el año explícito en publishedFromYear', () => {
    const request = armarRagQueryRequest({
      ...entradaBase,
      filtros: { publishedFromYear: 2021 },
    });

    expect(request.filtersApplied.publishedFromYear).toBe(2021);
  });
});

/** Fakes de los puertos: registran qué se llamó y en qué orden. */
function crearFakes(
  opciones: {
    caso?: ReturnType<typeof casoDeEjemplo> | null;
    tiposHabilitados?: readonly string[];
  } = {},
) {
  const llamadas: string[] = [];
  const recibido: {
    desidentificacion?: EntradaDeDesidentificacion;
    request?: RagQueryInternalRequest;
    cierre?: EntradaDeCierre;
    cierreSinIA?: EntradaDeCierreSinIA;
  } = {};
  const caso = opciones.caso === undefined ? casoDeEjemplo() : opciones.caso;
  const dependencias: DependenciasDelService = {
    casos: {
      leerCaso: async () => {
        llamadas.push('leerCaso');
        return caso;
      },
    },
    desidentificador: {
      desidentificar: async (entrada) => {
        llamadas.push('desidentificar');
        recibido.desidentificacion = entrada;
        return { clinicalContext: CONTEXTO, query: 'pregunta enmascarada' };
      },
    },
    rag: {
      consultar: async (request) => {
        llamadas.push('consultar');
        recibido.request = request;
        return { ok: false, status: 500 };
      },
    },
    cierre: {
      completar: async (entrada) => {
        llamadas.push('completar');
        recibido.cierre = entrada;
        return RESULTADO_DEL_CIERRE;
      },
      completarTipoNoHabilitado: async (entrada) => {
        llamadas.push('completarTipoNoHabilitado');
        recibido.cierreSinIA = entrada;
        return RESULTADO_DEL_CIERRE;
      },
    },
    tiposHabilitados: crearTiposHabilitados(opciones.tiposHabilitados ?? ['mama', 'prostata']),
    catalogo: { version: () => '1.0.0' },
    reloj: { now: () => AHORA_DE_EJEMPLO },
    config: { analysisMaxOptions: 1, evidenceDefaultYears: 10, ragTimeoutMs: 30_000 },
  };
  return { dependencias, llamadas, recibido };
}

const solicitud = {
  traceId: 'req_Fijo0001',
  userId: 'usuario-sintetico',
  peticion: {
    patientId: 'paciente-sintetico',
    query: 'pregunta sintética',
    continueWithWarning: false,
    sourcesSelected: FUENTES,
  },
};

describe('crearEvidenceAnalysisService', () => {
  it('lanza PacienteNoEncontradoError sin desidentificar ni llamar a la IA cuando el paciente no existe', async () => {
    const { dependencias, llamadas } = crearFakes({ caso: null });

    await expect(
      crearEvidenceAnalysisService(dependencias).solicitar(solicitud),
    ).rejects.toBeInstanceOf(PacienteNoEncontradoError);
    expect(llamadas).toEqual(['leerCaso']);
  });

  it('lanza TipoCancerNoRegistradoError sin desidentificar ni llamar a la IA cuando no hay diagnóstico activo', async () => {
    const { dependencias, llamadas } = crearFakes({
      caso: casoDeEjemplo({ diagnosticoActivo: null }),
    });

    await expect(
      crearEvidenceAnalysisService(dependencias).solicitar(solicitud),
    ).rejects.toBeInstanceOf(TipoCancerNoRegistradoError);
    expect(llamadas).toEqual(['leerCaso']);
  });

  it('no llama a la IA ni cierra el análisis cuando el desidentificador rechaza', async () => {
    const { dependencias, llamadas } = crearFakes();
    dependencias.desidentificador = {
      desidentificar: async () => {
        llamadas.push('desidentificar');
        throw new EntornoNoSintetico('app_env');
      },
    };

    await expect(
      crearEvidenceAnalysisService(dependencias).solicitar(solicitud),
    ).rejects.toBeInstanceOf(EntornoNoSintetico);
    expect(llamadas).toEqual(['leerCaso', 'desidentificar']);
  });

  it('desidentifica, consulta a la IA con el request armado y cierra el análisis, en ese orden', async () => {
    const { dependencias, llamadas, recibido } = crearFakes();

    const resultado = await crearEvidenceAnalysisService(dependencias).solicitar(solicitud);

    expect(llamadas).toEqual(['leerCaso', 'desidentificar', 'consultar', 'completar']);
    expect(recibido.desidentificacion).toMatchObject({
      query: 'pregunta sintética',
      dataOrigin: 'sintetico',
    });
    expect(recibido.request).toMatchObject({
      traceId: 'req_Fijo0001',
      query: 'pregunta enmascarada',
      catalogVersion: '1.0.0',
      maxOptions: 1,
      dataClassification: 'sintetico',
    });
    expect(recibido.request?.filtersApplied.publishedFromYear).toBe(2016);
    expect(recibido.cierre).toMatchObject({
      traceId: 'req_Fijo0001',
      patientId: 'paciente-sintetico',
      userId: 'usuario-sintetico',
      episodeId: 'episodio-sintetico',
      questionTemplateId: null,
      continueWithWarning: false,
      respuesta: { ok: false, status: 500 },
    });
    expect(resultado).toEqual(RESULTADO_DEL_CIERRE);
  });
});

describe('crearEvidenceAnalysisService: tipo de cáncer no habilitado', () => {
  const soloMama = { tiposHabilitados: ['mama'] } as const;

  it('no consulta a la IA ni construye el contexto: desidentifica solo la pregunta y cierra sin IA, en ese orden', async () => {
    const { dependencias, llamadas, recibido } = crearFakes(soloMama);

    const resultado = await crearEvidenceAnalysisService(dependencias).solicitar(solicitud);

    expect(llamadas).toEqual(['leerCaso', 'desidentificar', 'completarTipoNoHabilitado']);
    expect(recibido.desidentificacion?.contexto).toMatchObject({
      diagnosis: null,
      biomarkers: [],
      attributes: [],
      priorTreatments: [],
      events: [],
    });
    expect(resultado).toEqual(RESULTADO_DEL_CIERRE);
  });

  it('cierra con la pregunta enmascarada, las fuentes, los filtros efectivos y la versión del catálogo', async () => {
    const { dependencias, recibido } = crearFakes(soloMama);

    await crearEvidenceAnalysisService(dependencias).solicitar({
      ...solicitud,
      peticion: {
        ...solicitud.peticion,
        questionTemplateId: 'plantilla-1',
        continueWithWarning: true,
      },
    });

    expect(recibido.cierreSinIA).toMatchObject({
      traceId: 'req_Fijo0001',
      patientId: 'paciente-sintetico',
      userId: 'usuario-sintetico',
      episodeId: 'episodio-sintetico',
      questionTemplateId: 'plantilla-1',
      continueWithWarning: true,
      query: 'pregunta enmascarada',
      sourcesSelected: FUENTES,
      dataClassification: 'sintetico',
      catalogVersion: '1.0.0',
      filtersApplied: { historiaCompleta: false, publishedFromYear: 2016 },
      contextoVacio: { diagnosis: null, population: 'adulto' },
    });
  });

  it('no cierra sin IA cuando el desidentificador rechaza', async () => {
    const { dependencias, llamadas } = crearFakes(soloMama);
    dependencias.desidentificador = {
      desidentificar: async () => {
        llamadas.push('desidentificar');
        throw new EntornoNoSintetico('app_env');
      },
    };

    await expect(
      crearEvidenceAnalysisService(dependencias).solicitar(solicitud),
    ).rejects.toBeInstanceOf(EntornoNoSintetico);
    expect(llamadas).toEqual(['leerCaso', 'desidentificar']);
  });

  it('prioriza TipoCancerNoRegistradoError sobre el alcance cuando no hay diagnóstico activo', async () => {
    const { dependencias, llamadas } = crearFakes({
      ...soloMama,
      caso: casoDeEjemplo({ diagnosticoActivo: null }),
    });

    await expect(
      crearEvidenceAnalysisService(dependencias).solicitar(solicitud),
    ).rejects.toBeInstanceOf(TipoCancerNoRegistradoError);
    expect(llamadas).toEqual(['leerCaso']);
  });
});

describe('calcularDeadline', () => {
  it('devuelve el instante actual más RAG_TIMEOUT_MS en ISO 8601', () => {
    expect(calcularDeadline(new Date('2026-10-16T12:00:00.000Z'), 30_000)).toBe(
      '2026-10-16T12:00:30.000Z',
    );
  });
});

describe('plazo hacia rag-orchestrator', () => {
  afterEach(() => vi.useRealTimers());

  it('envía el deadline calculado con el reloj inyectado y una señal sin abortar cuando rag responde a tiempo', async () => {
    const { dependencias } = crearFakes();
    let opcionesRecibidas: OpcionesDeConsultaRag | undefined;
    dependencias.rag = {
      consultar: async (_request, opciones) => {
        opcionesRecibidas = opciones;
        return { ok: false, status: 500 };
      },
    };

    await crearEvidenceAnalysisService(dependencias).solicitar(solicitud);

    expect(opcionesRecibidas?.deadline).toBe(
      calcularDeadline(AHORA_DE_EJEMPLO, dependencias.config.ragTimeoutMs),
    );
    expect(opcionesRecibidas?.signal?.aborted).toBe(false);
  });

  it('no deja temporizadores pendientes cuando rag responde a tiempo', async () => {
    vi.useFakeTimers();
    const { dependencias } = crearFakes();

    await crearEvidenceAnalysisService(dependencias).solicitar(solicitud);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborta la llamada y cierra con tiempoAgotado cuando rag no responde dentro de ragTimeoutMs', async () => {
    vi.useFakeTimers();
    const { dependencias, recibido } = crearFakes();
    dependencias.rag = {
      consultar: (_request, opciones) =>
        new Promise((resolve) => {
          opciones?.signal?.addEventListener('abort', () =>
            resolve({ ok: false, status: null, tiempoAgotado: true }),
          );
        }),
    };

    const pendiente = crearEvidenceAnalysisService(dependencias).solicitar(solicitud);
    await vi.advanceTimersByTimeAsync(dependencias.config.ragTimeoutMs);
    await pendiente;

    expect(recibido.cierre?.respuesta).toEqual({ ok: false, status: null, tiempoAgotado: true });
  });
});
