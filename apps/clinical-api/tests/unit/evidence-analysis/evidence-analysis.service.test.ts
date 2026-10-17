import { describe, expect, it } from 'vitest';
import { TipoCancerNoRegistradoError } from '../../../src/modules/evidence-analysis/case-guards.js';
import {
  PacienteNoEncontradoError,
  armarRagQueryRequest,
  crearEvidenceAnalysisService,
  type DependenciasDelService,
} from '../../../src/modules/evidence-analysis/evidence-analysis.service.js';
import { DesidentificacionProvisionalRechazada } from '../../../src/modules/evidence-analysis/context-deidentifier.provisional.js';
import type {
  ClinicalContext,
  RagQueryInternalRequest,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type {
  EntradaDeCierre,
  EntradaDeDesidentificacion,
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
function crearFakes(opciones: { caso?: ReturnType<typeof casoDeEjemplo> | null } = {}) {
  const llamadas: string[] = [];
  const recibido: {
    desidentificacion?: EntradaDeDesidentificacion;
    request?: RagQueryInternalRequest;
    cierre?: EntradaDeCierre;
  } = {};
  const caso = opciones.caso === undefined ? casoDeEjemplo() : opciones.caso;
  const dependencias: DependenciasDelService = {
    casos: {
      leerCaso: async () => {
        llamadas.push('leerCaso');
        return caso;
      },
    },
    deidentificador: {
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
    },
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
    dependencias.deidentificador = {
      desidentificar: async () => {
        llamadas.push('desidentificar');
        throw new DesidentificacionProvisionalRechazada('app_env');
      },
    };

    await expect(
      crearEvidenceAnalysisService(dependencias).solicitar(solicitud),
    ).rejects.toBeInstanceOf(DesidentificacionProvisionalRechazada);
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
