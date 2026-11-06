import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  IDENTIDAD_CHAT,
  PREGUNTA_DE_CASO,
  abrirConversacion,
  enviarTurno,
  leerTurnosDeChat,
  textoDeLaConversacion,
} from '../../support/conversacion.js';
import {
  abrirSesion,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 9770;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-conversacion-seudonimo-0001';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let patientId: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_conversacion_seudonimo', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  patientId = await crearPacienteFxT4aA(mundo);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

describe('Seudónimo y traceId nuevos en cada turno (RN-11)', () => {
  it('envía el mismo threadId y un pseudoPatientId y un traceId distintos en cada turno, y no persiste ningún pseudoPatientId cuando se envían dos turnos [US-258 AC-5] [RN-11]', async () => {
    let n = 0;
    const { app } = await montarGateway(mundo, {
      identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
      traceIds: { traceId: () => `req_ChatTurno${String(++n).padStart(4, '0')}` },
    });
    const conversationId = await abrirConversacion(app, cookie, patientId);

    const primero = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_CASO);
    const segundo = await enviarTurno(
      app,
      cookie,
      conversationId,
      '¿Qué información falta del caso?',
    );

    expect(primero.status).toBe(201);
    expect(segundo.status).toBe(201);
    const [uno, dos] = rag.chat.capturadas.map((captura) => captura.cuerpo);
    expect(uno!['threadId']).toBe(dos!['threadId']);
    expect(uno!['pseudoPatientId']).not.toBe(dos!['pseudoPatientId']);
    expect(uno!['traceId']).not.toBe(dos!['traceId']);
    // El seudónimo es el mismo dentro del turno: el del contexto y el del cuerpo.
    expect((uno!['clinicalContext'] as { pseudoPatientId: string }).pseudoPatientId).toBe(
      uno!['pseudoPatientId'],
    );
    const filas = await leerTurnosDeChat(mundo.cliente, conversationId);
    expect(filas.map((fila) => fila.trace_id)).toEqual([uno!['traceId'], dos!['traceId']]);
    const persistido = await textoDeLaConversacion(mundo.cliente, conversationId);
    expect(persistido).not.toContain(uno!['pseudoPatientId']);
    expect(persistido).not.toContain(dos!['pseudoPatientId']);
  });

  it('envía a Backend 2 el thread_id de la conversación y no el id del paciente ni el de la conversación cuando se envía un turno [US-258 AC-5] [ADR-51]', async () => {
    const { app } = await montarGateway(mundo, {
      identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
    });
    const conversationId = await abrirConversacion(app, cookie, patientId);
    await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_CASO);

    const { rows } = await mundo.cliente.query<{ thread_id: string }>(
      'SELECT thread_id FROM clinical.conversation WHERE id = $1',
      [conversationId],
    );
    const enviado = rag.chat.capturadas[0]!.cuerpo;
    expect(enviado['threadId']).toBe(rows[0]!.thread_id);
    expect(enviado['threadId']).not.toBe(patientId);
    expect(enviado['threadId']).not.toBe(conversationId);
    expect(rag.chat.capturadas[0]!.texto).not.toContain(patientId);
    expect(rag.chat.capturadas[0]!.texto).not.toContain(conversationId);
  });
});
