import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EvidenceAnalysis } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  PII_FX_T4A_A,
  PREGUNTA_AC1,
  TODAS_LAS_FUENTES,
  abrirSesion,
  contarRegistrosPorTrace,
  crearPacienteFxT4aA,
  crearPacienteSintetico,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
  versionDelCatalogo,
} from '../../support/gateway.js';
import { traceIdsFijos } from '../../support/usuarios.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 731;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-tipo-no-habilitado-0001';
const FILTROS = {
  historiaCompleta: false,
  soloBiomarcadoresRelevantes: true,
  ultimosSeisMeses: true,
  antecedentesFamiliares: false,
  publishedFromYear: 2021,
};

// Un solo generador por archivo: el `trace_id` de cada registro persistido es distinto.
const generadorDeTraza = traceIdsFijos();
const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_tipo_no_habilitado', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

/** `ENABLED_CANCER_TYPES=mama`: el paciente (b), de próstata, queda fuera del alcance. */
const montarSoloMama = (opciones: Parameters<typeof montarGateway>[1] = {}) =>
  montarGateway(mundo, {
    tiposHabilitados: ['mama'],
    traceIds: { traceId: generadorDeTraza },
    ...opciones,
  });

async function analizar(
  app: Awaited<ReturnType<typeof montarSoloMama>>['app'],
  patientId: string,
  cuerpo: Record<string, unknown> = {},
) {
  return clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({ patientId, query: PREGUNTA_AC1, sourcesSelected: TODAS_LAS_FUENTES, ...cuerpo });
}

describe('gateway de análisis: tipo de cáncer no habilitado', () => {
  it('responde 200 tipo_no_habilitado con evidenceOptions vacío y topRelevanceScore null, cero llamadas a rag-orchestrator y registro persistido cuando ENABLED_CANCER_TYPES=mama y el paciente (b) es de próstata [US-043 AC-2]', async () => {
    const { app } = await montarSoloMama();

    const respuesta = await analizar(app, idDePaciente('b'));

    expect(respuesta.status).toBe(200);
    const analisis = respuesta.body as EvidenceAnalysis;
    expect(analisis.status).toBe('tipo_no_habilitado');
    expect(analisis.evidenceOptions).toEqual([]);
    expect(analisis.discardedOptions).toEqual([]);
    expect(analisis.topRelevanceScore).toBeNull();
    expect(rag.llamadas()).toBe(0);
    const registro = await leerRegistroPorTrace(mundo.cliente, analisis.traceId);
    expect(registro).toMatchObject({
      id: analisis.id,
      status: 'tipo_no_habilitado',
      top_relevance_score: null,
      patient_id: idDePaciente('b'),
    });
  });

  it('arma la Base con patientDataUsed vacío, 0 recuperados y 0 sobre el umbral, las fuentes excluidas y la fecha de CORPUS_CUTOFF_DATE, igual a la persistida [US-043 AC-2]', async () => {
    const { app } = await montarSoloMama({
      corpusExcludedSources: ['NCCN', 'ESMO'],
      corpusCutoffDate: '2026-09-30',
    });

    const respuesta = await analizar(app, idDePaciente('b'), {
      sourcesSelected: { guias: true, ensayos: false, publicaciones: true },
      filtersApplied: FILTROS,
    });

    expect(respuesta.status).toBe(200);
    const { analysisBasis, traceId } = respuesta.body as EvidenceAnalysis;
    expect(analysisBasis).toMatchObject({
      patientDataUsed: [],
      sourcesConsulted: {
        selected: ['guias', 'publicaciones'],
        filters: FILTROS,
        retrieved: 0,
        aboveThreshold: 0,
      },
      sourcesNotIncluded: ['NCCN', 'ESMO'],
      corpusCutoffDate: '2026-09-30',
      limitations: [
        { text: 'El tipo de cáncer no está habilitado en este entorno.', origin: 'estructural' },
      ],
      missingCriticalData: [],
      assumptions: [],
      priorAnalysesUsed: [],
      agentSteps: [],
      omittedClaims: 0,
    });
    const registro = await leerRegistroPorTrace(mundo.cliente, traceId);
    expect(registro?.analysis_basis).toEqual(analysisBasis);
  });

  it('no deja modelos, recuperación ni contexto clínico en el registro persistido cuando el tipo no está habilitado', async () => {
    const { app } = await montarSoloMama();

    const respuesta = await analizar(app, idDePaciente('b'));

    const registro = await leerRegistroPorTrace(mundo.cliente, respuesta.body.traceId);
    expect(registro).toMatchObject({
      llm_provider: null,
      llm_model: null,
      nli_model: null,
      embedding_model: null,
      reranker_model: null,
      prompt_version: null,
      corpus_release: null,
      retrieval_params: null,
      patient_data_links: [],
      catalog_version: versionDelCatalogo(),
    });
    expect(JSON.stringify(registro?.clinical_context_snapshot)).not.toMatch(/prostata|mama/);
  });

  it('consulta a rag-orchestrator una vez y responde con evidencia cuando el tipo del paciente (a) sí está habilitado', async () => {
    const { app } = await montarSoloMama();

    const respuesta = await analizar(app, idDePaciente('a'));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.status).toBe('con_evidencia');
    expect(rag.llamadas()).toBe(1);
  });

  it('responde 422 TIPO_CANCER_NO_REGISTRADO y no persiste nada cuando el paciente no tiene diagnóstico, aunque el tipo no esté habilitado', async () => {
    const sinDiagnostico = await crearPacienteSintetico(mundo, { conDiagnostico: false });
    const { app } = await montarSoloMama();

    const respuesta = await analizar(app, sinDiagnostico);

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('TIPO_CANCER_NO_REGISTRADO');
    expect(rag.llamadas()).toBe(0);
    expect(await contarRegistrosPorTrace(mundo.cliente, respuesta.body.traceId)).toBe(0);
  });

  it('enmascara la identidad de la pregunta en la respuesta y en el registro persistido cuando el tipo no está habilitado [RN-11]', async () => {
    const pacienteA = await crearPacienteFxT4aA(mundo);
    const { app } = await montarSoloMama({
      tiposHabilitados: ['prostata'],
      identidades: lectorDeIdentidadFalso({
        [pacienteA]: {
          nombreCompleto: PII_FX_T4A_A.nombre,
          documento: PII_FX_T4A_A.cedula,
          telefono: PII_FX_T4A_A.telefono,
        },
      }),
    });

    const respuesta = await analizar(app, pacienteA, {
      query: `¿Qué opciones describe la evidencia para Lucía Rondón, CC ${PII_FX_T4A_A.cedula}?`,
    });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.status).toBe('tipo_no_habilitado');
    const registro = await leerRegistroPorTrace(mundo.cliente, respuesta.body.traceId);
    for (const texto of [JSON.stringify(respuesta.body), JSON.stringify(registro)]) {
      expect(texto).not.toContain(PII_FX_T4A_A.cedula);
      expect(texto).not.toContain('Rondón');
    }
  });
});
