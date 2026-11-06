import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import chatTurnRequest from '../../../../../contracts/examples/chat-turn-request.json' with { type: 'json' };
import chatTurnCasoOk from '../../../../../contracts/examples/chat-turn-caso-ok.json' with { type: 'json' };
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  IDENTIDAD_CHAT,
  PREGUNTA_DE_CASO,
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
  versionDelCatalogo,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 9810;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-conversacion-turno-0001';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let patientId: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_conversacion_turno', ESPACIO_DE_IDS);
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

describe('Turno persistido antes de responder', () => {
  it('responde 201 con el turno y guarda la fila con la pregunta enmascarada y los bloques validados cuando el doctor pregunta [US-258 AC-2] [RN-06] [AC-T1.4]', async () => {
    const { app } = await montar();
    const conversationId = await abrirConversacion(app, cookie, patientId);

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_CASO);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      turnNumber: 1,
      intent: 'caso',
      status: 'respondido',
      topRelevanceScore: null,
      question: PREGUNTA_DE_CASO,
      omittedClaims: 0,
      notices: chatTurnCasoOk.notices,
    });
    expect(respuesta.body.blocks).toEqual(chatTurnCasoOk.blocks);
    expect(respuesta.body).not.toHaveProperty('citationIds');
    expect(respuesta.body).not.toHaveProperty('memoryUsed');
    const filas = await leerTurnosDeChat(mundo.cliente, conversationId);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      id: respuesta.body.id,
      turn_number: 1,
      question_masked: PREGUNTA_DE_CASO,
      intent: 'caso',
      blocks: chatTurnCasoOk.blocks,
      omitted_claims: 0,
      notices: chatTurnCasoOk.notices,
      llm_provider: 'local',
      analysis_id: null,
    });
    expect(filas[0]!.structured_state).toEqual(chatTurnCasoOk.structuredState);
  });

  it('deriva dataUsed, dataMissing y dataLinks de lo enviado a Backend 2 cuando el turno responde con bloques sobre los hechos [US-258 AC-2]', async () => {
    const { app } = await montar();
    const conversationId = await abrirConversacion(app, cookie, patientId);

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_CASO);

    expect(respuesta.status).toBe(201);
    const enviado = rag.chat.capturadas[0]!.cuerpo as {
      caseFacts: { factRef: string }[];
      completeness: { label: string; gapType: string | null }[];
    };
    // Lo enviado es el oráculo: los campos derivados no los recibe de Backend 2 (glosario S6 §2).
    expect(respuesta.body.dataUsed).toHaveLength(enviado.caseFacts.length);
    expect(respuesta.body.dataUsed).toContain('Diagnóstico');
    expect(respuesta.body.dataUsed).toContain('Biomarcador');
    expect(respuesta.body.dataMissing).toEqual(
      enviado.completeness.filter((item) => item.gapType !== null).map((item) => item.label),
    );
    const { rows } = await mundo.cliente.query<{ id: string }>(
      'SELECT id FROM clinical.diagnosis WHERE patient_id = $1 AND is_active',
      [patientId],
    );
    expect(respuesta.body.dataLinks[0]).toMatchObject({
      factRef: 'f1',
      resourceType: 'diagnosis',
      resourceId: rows[0]!.id,
    });
    expect(respuesta.body.dataLinks.map((enlace: { factRef: string }) => enlace.factRef)).toEqual([
      'f1',
      'f2',
    ]);
  });

  it('envía la clasificación del paciente, la versión del catálogo y la rehidratación vacía del primer turno sin activeAnalysisId cuando la conversación no tiene turnos [US-258 AC-2] [RN-12] [RN-29] [ADR-51]', async () => {
    const { app } = await montar();
    const conversationId = await abrirConversacion(app, cookie, patientId);

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_CASO);

    expect(respuesta.status).toBe(201);
    // El primer turno, sin 404 ni reenvío: rag responde 404 a un hilo que no conoce y no distingue uno nuevo de uno perdido.
    expect(rag.chat.llamadas()).toBe(1);
    const enviado = rag.chat.capturadas[0]!.cuerpo;
    expect(enviado['dataClassification']).toBe('sintetico');
    expect(enviado['catalogVersion']).toBe(versionDelCatalogo());
    expect(enviado['rehydration']).toEqual(chatTurnRequest.rehydration);
    expect(enviado).not.toHaveProperty('activeAnalysisId');
  });
});
