import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DOCUMENTO_SINTETICO_CHAT,
  NACIMIENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
} from '../../../prisma/seed/pacientes/chat.js';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  IDENTIDAD_CHAT,
  PREGUNTA_FX_12_D,
  abrirConversacion,
  enviarTurno,
  leerTurnosDeChat,
} from '../../support/conversacion.js';
import {
  abrirSesion,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 9760;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-conversacion-pii-0001';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let patientId: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_conversacion_pii', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  patientId = await crearPacienteFxT4aA(mundo);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

describe('Pregunta enmascarada antes de enviarse, de persistirse y de responderse (RN-10, RN-11, ADR-40)', () => {
  it('no deja pasar el nombre, el documento ni la fecha de nacimiento a la IA, a la fila, a la respuesta ni a los logs cuando la pregunta trae PII [US-258 AC-4] [RN-10] [RN-11] [ADR-40]', async () => {
    const { app, logger } = await montarGateway(mundo, {
      identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
    });
    const conversationId = await abrirConversacion(app, cookie, patientId);
    logger.lineas.length = 0;

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_FX_12_D);

    expect(respuesta.status).toBe(201);
    const enviado = rag.chat.capturadas[0]!;
    const [fila] = await leerTurnosDeChat(mundo.cliente, conversationId);
    for (const prohibido of [
      NOMBRE_SINTETICO_CHAT,
      DOCUMENTO_SINTETICO_CHAT,
      NACIMIENTO_SINTETICO_CHAT,
    ]) {
      expect(enviado.texto, prohibido).not.toContain(prohibido);
      expect(fila!.question_masked, prohibido).not.toContain(prohibido);
      expect(JSON.stringify(respuesta.body), prohibido).not.toContain(prohibido);
      expect(logger.texto(), prohibido).not.toContain(prohibido);
    }
    // La misma cadena enmascarada viaja, se persiste y se devuelve.
    expect(fila!.question_masked).toBe(enviado.cuerpo['question']);
    expect(respuesta.body.question).toBe(fila!.question_masked);
    expect(logger.texto()).not.toContain(PREGUNTA_FX_12_D);
  });
});
