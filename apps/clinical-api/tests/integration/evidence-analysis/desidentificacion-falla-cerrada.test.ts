import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import {
  PII_FX_T4A_A,
  PUNTERO_503,
  TODAS_LAS_FUENTES,
  abrirSesion,
  contarRegistrosPorTrace,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import {
  detectoresCaidos,
  lectorDeIdentidadCaido,
  lectorDeIdentidadFalso,
} from '../../support/desidentificacion.js';

const ESPACIO_DE_IDS = 503;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-desidentificacion-0003';
const TRACE_ID = 'req_FallaCerr01';
const PREGUNTA = `¿Qué opciones describe la evidencia para ${PII_FX_T4A_A.nombre}, HER2 3+?`;

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let pacienteA: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_desid_cerrada', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  pacienteA = await crearPacienteFxT4aA(mundo);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const solicitar = (app: Awaited<ReturnType<typeof montarGateway>>['app']) =>
  request(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({ patientId: pacienteA, query: PREGUNTA, sourcesSelected: TODAS_LAS_FUENTES });

describe('la desidentificación falla cerrada', () => {
  it('responde 503 DESIDENTIFICACION_NO_DISPONIBLE sin llamar a rag-orchestrator ni persistir cuando el detector de PII lanza [US-049 AC-7]', async () => {
    const { app, logger } = await montarGateway(mundo, {
      traceIds: { traceId: () => TRACE_ID },
      identidades: lectorDeIdentidadFalso({
        [pacienteA]: { nombreCompleto: PII_FX_T4A_A.nombre, documento: PII_FX_T4A_A.cedula },
      }),
      detectores: detectoresCaidos(),
    });

    const respuesta = await solicitar(app);

    expect(respuesta.status).toBe(503);
    expect(respuesta.body).toEqual({
      error: 'DESIDENTIFICACION_NO_DISPONIBLE',
      message: 'No fue posible preparar la consulta.',
      traceId: TRACE_ID,
    });
    assertMatchesSpec('clinical-api', PUNTERO_503, respuesta.body);
    expect(rag.llamadas()).toBe(0);
    expect(await contarRegistrosPorTrace(mundo.cliente, TRACE_ID)).toBe(0);
    expect(logger.texto()).not.toContain(PREGUNTA);
    expect(logger.texto()).not.toContain('Lucía');
  });

  it('responde 503 DESIDENTIFICACION_NO_DISPONIBLE sin llamar a rag-orchestrator ni persistir cuando el lector de identidad lanza [US-049 AC-7]', async () => {
    const { app } = await montarGateway(mundo, {
      traceIds: { traceId: () => TRACE_ID },
      identidades: lectorDeIdentidadCaido(),
    });

    const respuesta = await solicitar(app);

    expect(respuesta.status).toBe(503);
    expect(respuesta.body.error).toBe('DESIDENTIFICACION_NO_DISPONIBLE');
    assertMatchesSpec('clinical-api', PUNTERO_503, respuesta.body);
    expect(rag.llamadas()).toBe(0);
    expect(await contarRegistrosPorTrace(mundo.cliente, TRACE_ID)).toBe(0);
  });
});
