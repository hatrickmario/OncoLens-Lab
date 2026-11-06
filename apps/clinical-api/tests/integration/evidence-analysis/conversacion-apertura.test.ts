import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  IDENTIDAD_CHAT,
  abrirConversacion,
  rutaDeApertura,
  rutaDeConversacion,
} from '../../support/conversacion.js';
import {
  abrirSesion,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9750;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-conversacion-0001';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let patientId: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_conversacion_apertura', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  patientId = await crearPacienteFxT4aA(mundo);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

async function montar() {
  return montarGateway(mundo, {
    identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
  });
}

describe('Conversación anclada al paciente', () => {
  it('responde 201 sin threadId y guarda un thread_id UUID v4 distinto cuando el doctor abre una conversación; el GET devuelve turns vacío [US-258 AC-1]', async () => {
    const { app } = await montar();

    const creada = await clienteVerificado(app)
      .post(rutaDeApertura(patientId))
      .set('Cookie', cookie);

    expect(creada.status).toBe(201);
    expect(creada.headers['cache-control']).toBe('no-store');
    expect(creada.body).not.toHaveProperty('threadId');
    expect(creada.body.patientId).toBe(patientId);
    const { rows } = await mundo.cliente.query<{
      id: string;
      patient_id: string;
      thread_id: string;
    }>('SELECT id, patient_id, thread_id FROM clinical.conversation WHERE id = $1', [
      creada.body.conversationId,
    ]);
    expect(rows[0]!.thread_id).toMatch(UUID_V4);
    expect(rows[0]!.thread_id).not.toBe(rows[0]!.patient_id);
    expect(rows[0]!.thread_id).not.toBe(rows[0]!.id);

    const leida = await clienteVerificado(app)
      .get(rutaDeConversacion(creada.body.conversationId))
      .set('Cookie', cookie);

    expect(leida.status).toBe(200);
    expect(leida.body.turns).toEqual([]);
    expect(leida.body).not.toHaveProperty('threadId');
  });

  it('guarda un thread_id distinto por conversación y nunca derivado del paciente cuando se abren dos del mismo paciente [US-258 AC-1] [ADR-51]', async () => {
    const { app } = await montar();

    const primera = await abrirConversacion(app, cookie, patientId);
    const segunda = await abrirConversacion(app, cookie, patientId);

    const { rows } = await mundo.cliente.query<{ thread_id: string }>(
      'SELECT thread_id FROM clinical.conversation WHERE id = ANY($1) ORDER BY created_at, id',
      [[primera, segunda]],
    );
    expect(new Set(rows.map((fila) => fila.thread_id)).size).toBe(2);
    for (const { thread_id } of rows) {
      expect(thread_id).toMatch(UUID_V4);
      expect(thread_id).not.toBe(patientId);
    }
  });
});
