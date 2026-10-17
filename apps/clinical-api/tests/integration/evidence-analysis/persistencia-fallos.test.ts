import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import deadlineVencido from '../../../../../contracts/examples/error-deadline-vencido.json' with { type: 'json' };
import errorInterno from '../../../../../contracts/examples/error-interno-analisis.json' with { type: 'json' };
import llmLocalNoDisponible from '../../../../../contracts/examples/error-llm-local-no-disponible.json' with { type: 'json' };
import errorServicioIa from '../../../../../contracts/examples/error-servicio-ia.json' with { type: 'json' };
import tipoCancerNoRegistrado from '../../../../../contracts/examples/error-tipo-cancer-no-registrado.json' with { type: 'json' };
import ragColaLlena from '../../../../../contracts/examples/rag-cola-inferencia-llena.json' with { type: 'json' };
import ragCatalogo from '../../../../../contracts/examples/rag-catalog-version-mismatch.json' with { type: 'json' };
import ragDeadline from '../../../../../contracts/examples/rag-deadline-vencido.json' with { type: 'json' };
import ragConEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import ragSinEvidencia from '../../../../../contracts/examples/rag-query-sin-evidencia.json' with { type: 'json' };
import ragLlmLocal from '../../../../../contracts/examples/rag-llm-local-no-disponible.json' with { type: 'json' };
import ragRecuperacion from '../../../../../contracts/examples/rag-recuperacion-no-disponible.json' with { type: 'json' };
import ragTipoCancer from '../../../../../contracts/examples/rag-tipo-cancer-no-registrado.json' with { type: 'json' };
import ragTokenInvalido from '../../../../../contracts/examples/rag-token-servicio-invalido.json' with { type: 'json' };
import ragValidacion from '../../../../../contracts/examples/rag-validacion-422.json' with { type: 'json' };
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import {
  AHORA,
  PREGUNTA_Q_HER2,
  PUNTERO_422,
  PUNTERO_500,
  PUNTERO_502,
  PUNTERO_503,
  PUNTERO_504,
  RAG_TIMEOUT_MS_DE_TEST,
  TODAS_LAS_FUENTES,
  abrirSesion,
  contarRegistrosPorTrace,
  idDePaciente,
  instalarFalloDeEscrituraDelRegistro,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 302;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-fallos-0001';
const TEXTO_INTERNO = 'texto interno sintético de rag-orchestrator con valores de la fila';
const OPCION_DEL_EJEMPLO = ragConEvidencia.evidenceOptions[0]!.option;

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let quitarTrigger: (() => Promise<void>) | undefined;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_persistencia_fallos', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(async () => {
  rag.reiniciar();
  await quitarTrigger?.();
  quitarTrigger = undefined;
});
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const gateway = (traceId: string) => montarGateway(mundo, { ids: { traceId: () => traceId } });

async function solicitar(app: Awaited<ReturnType<typeof gateway>>['app']) {
  return request(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({
      patientId: idDePaciente('a'),
      query: PREGUNTA_Q_HER2,
      sourcesSelected: TODAS_LAS_FUENTES,
    });
}

const responderJson = (status: number, cuerpo: object, cabeceras?: Record<string, string>) =>
  rag.responder({ tipo: 'json', status, cuerpo, ...(cabeceras !== undefined && { cabeceras }) });

/** Lo común a todo fallo de rag-orchestrator: la respuesta fija, el `traceId` generado y ningún registro. */
async function afirmarFallo(
  respuesta: Awaited<ReturnType<typeof solicitar>>,
  traceId: string,
  esperado: { status: number; error: string; message: string; puntero: string },
) {
  expect(respuesta.status).toBe(esperado.status);
  expect(respuesta.body).toEqual({
    error: esperado.error,
    message: esperado.message,
    traceId,
  });
  assertMatchesSpec('clinical-api', esperado.puntero, respuesta.body);
  expect(await contarRegistrosPorTrace(mundo.cliente, traceId)).toBe(0);
}

describe('un fallo de persistencia nunca muestra el análisis (RN-06)', () => {
  it('responde 500 genérico sin evidenceOptions ni fila persistida y registra el traceId cuando falla la escritura del registro [US-053 AC-2]', async () => {
    quitarTrigger = await instalarFalloDeEscrituraDelRegistro(
      mundo.cliente,
      'valor sintético de la fila en el error de PostgreSQL',
    );
    const { app, logger } = await gateway('req_FalloBd0001');

    const respuesta = await solicitar(app);

    expect(respuesta.status).toBe(500);
    assertMatchesSpec('clinical-api', PUNTERO_500, respuesta.body);
    expect(respuesta.body).toEqual({
      error: 'ERROR_INTERNO',
      message: errorInterno.message,
      traceId: 'req_FalloBd0001',
    });
    expect(respuesta.body).not.toHaveProperty('evidenceOptions');
    expect(JSON.stringify(respuesta.body)).not.toContain(OPCION_DEL_EJEMPLO);
    expect(await contarRegistrosPorTrace(mundo.cliente, 'req_FalloBd0001')).toBe(0);
    expect(logger.texto()).toContain('req_FalloBd0001');
    for (const prohibido of [PREGUNTA_Q_HER2, OPCION_DEL_EJEMPLO, 'valor sintético de la fila']) {
      expect(logger.texto(), prohibido).not.toContain(prohibido);
    }
  });
});

describe('deadline hacia rag-orchestrator sin registro persistido', () => {
  it('responde 504 sin registro y envía X-Request-Deadline cuando rag-orchestrator no responde dentro de RAG_TIMEOUT_MS [US-053 AC-3]', async () => {
    rag.responder({ tipo: 'tardia' });
    const { app } = await gateway('req_Plazo000001');

    const respuesta = await solicitar(app);

    await afirmarFallo(respuesta, 'req_Plazo000001', {
      status: 504,
      error: 'DEADLINE_VENCIDO',
      message: deadlineVencido.message,
      puntero: PUNTERO_504,
    });
    const esperado = new Date(new Date(AHORA).getTime() + RAG_TIMEOUT_MS_DE_TEST).toISOString();
    expect(rag.capturadas[0]!.headers.get('x-request-deadline')).toBe(esperado);
  });

  it('responde 504 sin registro cuando rag-orchestrator responde 504 DEADLINE_VENCIDO [US-053 AC-3]', async () => {
    responderJson(504, ragDeadline);
    const { app } = await gateway('req_Plazo000002');

    const respuesta = await solicitar(app);

    await afirmarFallo(respuesta, 'req_Plazo000002', {
      status: 504,
      error: 'DEADLINE_VENCIDO',
      message: deadlineVencido.message,
      puntero: PUNTERO_504,
    });
    expect(JSON.stringify(respuesta.body)).not.toContain(ragDeadline.message);
  });
});

describe('una sola tabla de mapeo de fallos de rag-orchestrator', () => {
  it('responde 503 LOCAL_LLM_UNAVAILABLE sin registro cuando rag-orchestrator responde 503 LOCAL_LLM_UNAVAILABLE [US-053 AC-4]', async () => {
    responderJson(503, ragLlmLocal);
    const { app } = await gateway('req_Mapeo0000001');

    await afirmarFallo(await solicitar(app), 'req_Mapeo0000001', {
      status: 503,
      error: 'LOCAL_LLM_UNAVAILABLE',
      message: llmLocalNoDisponible.message,
      puntero: PUNTERO_503,
    });
  });

  it('responde 502 sin eco ni registro cuando rag-orchestrator responde 503 RETRIEVAL_UNAVAILABLE [US-053 AC-4]', async () => {
    responderJson(503, { ...ragRecuperacion, message: TEXTO_INTERNO });
    const { app } = await gateway('req_Mapeo0000002');

    const respuesta = await solicitar(app);

    await afirmarFallo(respuesta, 'req_Mapeo0000002', {
      status: 502,
      error: 'ERROR_SERVICIO_IA',
      message: errorServicioIa.message,
      puntero: PUNTERO_502,
    });
    expect(JSON.stringify(respuesta.body)).not.toContain(TEXTO_INTERNO);
  });

  it('responde 502 sin registro cuando rag-orchestrator responde 503 NLI_UNAVAILABLE [US-053 AC-4]', async () => {
    responderJson(503, {
      error: 'NLI_UNAVAILABLE',
      message: 'La verificación de soporte no está disponible.',
      traceId: 'req_8a9b0c1d',
    });
    const { app } = await gateway('req_Mapeo0000003');

    await afirmarFallo(await solicitar(app), 'req_Mapeo0000003', {
      status: 502,
      error: 'ERROR_SERVICIO_IA',
      message: errorServicioIa.message,
      puntero: PUNTERO_502,
    });
  });

  it('responde 502 sin eco ni registro cuando rag-orchestrator responde 422 de validación [US-053 AC-4]', async () => {
    responderJson(422, ragValidacion);
    const { app } = await gateway('req_Mapeo0000004');

    const respuesta = await solicitar(app);

    await afirmarFallo(respuesta, 'req_Mapeo0000004', {
      status: 502,
      error: 'ERROR_SERVICIO_IA',
      message: errorServicioIa.message,
      puntero: PUNTERO_502,
    });
    expect(JSON.stringify(respuesta.body)).not.toContain('maxOptions');
  });

  it('responde 422 TIPO_CANCER_NO_REGISTRADO con el mensaje fijo de clinical-api, sin eco ni registro, cuando rag-orchestrator responde 422 TIPO_CANCER_NO_REGISTRADO [US-053 AC-4] [S1 resp. 35]', async () => {
    responderJson(422, { ...ragTipoCancer, message: TEXTO_INTERNO });
    const { app } = await gateway('req_Mapeo0000005');

    const respuesta = await solicitar(app);

    await afirmarFallo(respuesta, 'req_Mapeo0000005', {
      status: 422,
      error: 'TIPO_CANCER_NO_REGISTRADO',
      message: tipoCancerNoRegistrado.message,
      puntero: PUNTERO_422,
    });
    expect(JSON.stringify(respuesta.body)).not.toContain(TEXTO_INTERNO);
  });

  it('responde 502 sin registro cuando rag-orchestrator responde 503 con un código desconocido [US-053 AC-4]', async () => {
    responderJson(503, {
      error: 'CODIGO_QUE_NO_EXISTE',
      message: TEXTO_INTERNO,
      traceId: 'req_x1',
    });
    const { app } = await gateway('req_Mapeo0000006');

    const respuesta = await solicitar(app);

    await afirmarFallo(respuesta, 'req_Mapeo0000006', {
      status: 502,
      error: 'ERROR_SERVICIO_IA',
      message: errorServicioIa.message,
      puntero: PUNTERO_502,
    });
    expect(JSON.stringify(respuesta.body)).not.toContain(TEXTO_INTERNO);
  });

  it.each([
    ['401', 401, ragTokenInvalido],
    ['500', 500, { error: 'ERROR_INTERNO', message: TEXTO_INTERNO, traceId: 'req_x2' }],
  ])(
    'responde 502 sin detalles internos ni registro cuando rag-orchestrator responde %s [US-053 AC-4]',
    async (_nombre, status, cuerpo) => {
      responderJson(status, cuerpo);
      const { app } = await gateway(`req_Mapeo${status}001`);

      const respuesta = await solicitar(app);

      await afirmarFallo(respuesta, `req_Mapeo${status}001`, {
        status: 502,
        error: 'ERROR_SERVICIO_IA',
        message: errorServicioIa.message,
        puntero: PUNTERO_502,
      });
      expect(JSON.stringify(respuesta.body)).not.toContain(TEXTO_INTERNO);
    },
  );

  it.each([
    [
      'sin_evidencia con topRelevanceScore 0.0',
      'req_Contrato001',
      { ...ragSinEvidencia, topRelevanceScore: 0 },
    ],
    [
      'sin el bloque meta',
      'req_Contrato002',
      Object.fromEntries(Object.entries(ragConEvidencia).filter(([campo]) => campo !== 'meta')),
    ],
  ])(
    'responde 502 sin registro cuando la respuesta interna no cumple el contrato (%s) [US-053 AC-4]',
    async (_nombre, traceId, cuerpo) => {
      responderJson(200, cuerpo);
      const { app } = await gateway(traceId);

      await afirmarFallo(await solicitar(app), traceId, {
        status: 502,
        error: 'ERROR_SERVICIO_IA',
        message: errorServicioIa.message,
        puntero: PUNTERO_502,
      });
    },
  );

  it('responde 502 sin registro cuando la conexión falla [US-053 AC-4]', async () => {
    rag.responder({ tipo: 'red' });
    const { app } = await gateway('req_Mapeo0000007');

    await afirmarFallo(await solicitar(app), 'req_Mapeo0000007', {
      status: 502,
      error: 'ERROR_SERVICIO_IA',
      message: errorServicioIa.message,
      puntero: PUNTERO_502,
    });
  });

  it.each([
    ['409', 409, ragCatalogo, undefined],
    ['429', 429, ragColaLlena, { 'Retry-After': '30' }],
  ])(
    'responde 502 sin Retry-After ni registro cuando rag-orchestrator responde %s en el S1 [US-053 AC-4]',
    async (_nombre, status, cuerpo, cabeceras) => {
      responderJson(status, cuerpo, cabeceras);
      const { app } = await gateway(`req_Mapeo${status}002`);

      const respuesta = await solicitar(app);

      await afirmarFallo(respuesta, `req_Mapeo${status}002`, {
        status: 502,
        error: 'ERROR_SERVICIO_IA',
        message: errorServicioIa.message,
        puntero: PUNTERO_502,
      });
      expect(respuesta.headers['retry-after']).toBeUndefined();
    },
  );
});
