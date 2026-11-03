import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import errorLimite from '../../../../../contracts/examples/error-limite-seguimiento.json' with { type: 'json' };
import { clienteVerificado } from '../../support/verificarProveedor.js';
import {
  abrirSesion,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import {
  PREGUNTA_DE_SEGUIMIENTO,
  crearAnalisisConEvidencia,
  leerTurnos,
  rutaDeSeguimiento,
  sembrarTurnos,
} from '../../support/seguimiento.js';

const ESPACIO_DE_IDS = 9620;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-seguimiento-limite-0001';
/** El tope del contrato de ejemplo (`error-limite-seguimiento.json`) y de la configuración por defecto. */
const TOPE_POR_DEFECTO = 10;

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_seguimiento_limite', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

describe('límite de preguntas de seguimiento por análisis (RN-22)', () => {
  it('responde 409 LIMITE_SEGUIMIENTO sin llamar a la IA cuando el análisis tiene 10 turnos [US-218 AC-4]', async () => {
    const { app } = await montarGateway(mundo, {
      traceIds: { traceId: () => 'req_SegLimite001' },
      analysisMaxOptions: 3,
      analysisFollowupMax: TOPE_POR_DEFECTO,
    });
    const analisis = await crearAnalisisConEvidencia(app, cookie, rag, idDePaciente('a'));
    await sembrarTurnos(mundo, analisis.id, TOPE_POR_DEFECTO);
    rag.reiniciar();

    const respuesta = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie)
      .send({ question: PREGUNTA_DE_SEGUIMIENTO });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body).toEqual({
      error: 'LIMITE_SEGUIMIENTO',
      message: errorLimite.message,
      traceId: expect.any(String),
    });
    expect(rag.seguimiento.llamadas()).toBe(0);
    expect(await leerTurnos(mundo.cliente, analisis.id)).toHaveLength(TOPE_POR_DEFECTO);
  });
});
