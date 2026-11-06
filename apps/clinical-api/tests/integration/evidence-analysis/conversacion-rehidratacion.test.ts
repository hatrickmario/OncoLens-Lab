import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import chatTurnCasoOk from '../../../../../contracts/examples/chat-turn-caso-ok.json' with { type: 'json' };
import chatTurnHiloDesconocido from '../../../../../contracts/examples/chat-turn-hilo-desconocido.json' with { type: 'json' };
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  IDENTIDAD_CHAT,
  abrirConversacion,
  contarTurnosDeChat,
  enviarTurno,
  sembrarTurnoDeChat,
} from '../../support/conversacion.js';
import {
  abrirSesion,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type EscenarioDeRag,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { crearAnalisisConEvidencia } from '../../support/seguimiento.js';

const ESPACIO_DE_IDS = 9780;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-conversacion-rehidratacion-0001';
const UUID_CUALQUIERA = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const FECHA_ABSOLUTA = /\d{4}-\d{2}-\d{2}/;
const FECHA_SEMBRADA = ['2025', '01', '15'].join('-');

const HILO_DESCONOCIDO: EscenarioDeRag = {
  tipo: 'json',
  status: 404,
  cuerpo: chatTurnHiloDesconocido,
};
const TURNO_OK: EscenarioDeRag = { tipo: 'json', status: 200, cuerpo: chatTurnCasoOk };

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let patientId: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_conversacion_rehidratacion', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  patientId = await crearPacienteFxT4aA(mundo);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const ESTADO_DEL_TERCER_TURNO = {
  intentsVistos: ['caso', 'faltantes'],
  preguntasPrevias: ['¿Cuál es la situación actual?', '¿Qué información falta?', '¿Y el HER2?'],
  opcionesMostradas: [],
  citasMostradas: [],
  faltantesSenalados: ['ki67'],
};

async function sembrarTresTurnos(conversationId: string): Promise<void> {
  const bloque = {
    kind: 'documentado',
    text: 'Diagnóstico de mama documentado.',
    factRefs: ['f1'],
  };
  await sembrarTurnoDeChat(mundo, conversationId, {
    turnNumber: 1,
    question: '¿Cuál es la situación actual?',
    blocks: [bloque],
  });
  await sembrarTurnoDeChat(mundo, conversationId, {
    turnNumber: 2,
    question: '¿Qué información falta?',
    intent: 'faltantes',
    blocks: [{ kind: 'faltante', text: 'Falta el Ki-67.' }],
  });
  await sembrarTurnoDeChat(mundo, conversationId, {
    turnNumber: 3,
    question: '¿Y el HER2?',
    blocks: [bloque],
    structuredState: ESTADO_DEL_TERCER_TURNO,
  });
}

describe('Rehidratación única ante un hilo desconocido (S6 resp. 9)', () => {
  it('reenvía el turno una sola vez con los últimos turnos enmascarados y responde 201 cuando Backend 2 no conoce el hilo [US-258 AC-6] [S6 resp. 9] [RN-22]', async () => {
    const { app } = await montarGateway(mundo, {
      identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
      chatRehydrateTurns: 2,
    });
    const conversationId = await abrirConversacion(app, cookie, patientId);
    await sembrarTresTurnos(conversationId);
    rag.chat.responder(HILO_DESCONOCIDO, TURNO_OK);

    const respuesta = await enviarTurno(app, cookie, conversationId, '¿Qué evidencia existe?');

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.turnNumber).toBe(4);
    expect(rag.chat.llamadas()).toBe(2);
    expect(rag.chat.capturadas[0]!.cuerpo).not.toHaveProperty('rehydration');
    const rehidratacion = rag.chat.capturadas[1]!.cuerpo['rehydration'] as {
      turns: Record<string, unknown>[];
      structuredState: unknown;
    };
    // Máximo CHAT_REHYDRATE_TURNS (2): los dos últimos, en orden, con exactamente las claves de la lista blanca.
    expect(rehidratacion.turns.map((turno) => turno['question'])).toEqual([
      '¿Qué información falta?',
      '¿Y el HER2?',
    ]);
    for (const turno of rehidratacion.turns) {
      expect(Object.keys(turno).sort()).toEqual(['blocksText', 'factRefs', 'intent', 'question']);
    }
    expect(rehidratacion.turns[1]).toEqual({
      question: '¿Y el HER2?',
      intent: 'caso',
      blocksText: ['Diagnóstico de mama documentado.'],
      factRefs: ['f1'],
    });
    expect(rehidratacion.structuredState).toEqual(ESTADO_DEL_TERCER_TURNO);
  });

  it('no envía UUID, fechas absolutas, analysisId ni enlaces del turno persistido cuando rehidrata [US-258 AC-6] [RN-11] [ADR-51]', async () => {
    const { app } = await montarGateway(mundo, {
      identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
      analysisMaxOptions: 3,
    });
    const analisis = await crearAnalisisConEvidencia(app, cookie, rag, patientId);
    rag.reiniciar();
    const conversationId = await abrirConversacion(app, cookie, patientId);
    const diagnostico = await mundo.cliente.query<{ id: string }>(
      'SELECT id FROM clinical.diagnosis WHERE patient_id = $1 AND is_active',
      [patientId],
    );
    await sembrarTurnoDeChat(mundo, conversationId, {
      turnNumber: 1,
      question: '¿Cuál es la situación actual?',
      blocks: [{ kind: 'documentado', text: 'Diagnóstico de mama documentado.', factRefs: ['f1'] }],
      dataLinks: [
        {
          factRef: 'f1',
          resourceType: 'diagnosis',
          resourceId: diagnostico.rows[0]!.id,
          origin: 'seed',
          relativeDay: 0,
          recordedDate: FECHA_SEMBRADA,
        },
      ],
      analysisId: analisis.id,
    });
    rag.chat.responder(HILO_DESCONOCIDO, TURNO_OK);

    const respuesta = await enviarTurno(app, cookie, conversationId, '¿Qué información falta?');

    expect(respuesta.status).toBe(201);
    const reenviado = rag.chat.capturadas[1]!;
    const uuids = reenviado.texto.match(UUID_CUALQUIERA) ?? [];
    // Solo el threadId y el activeAnalysisId (L1D-322: enruta el turno, nunca va en la rehidratación) tienen forma de UUID.
    expect(uuids).toEqual([reenviado.cuerpo['threadId'], analisis.id]);
    expect(reenviado.cuerpo['activeAnalysisId']).toBe(analisis.id);
    expect(reenviado.texto).not.toMatch(FECHA_ABSOLUTA);
    const rehidratacion = JSON.stringify(reenviado.cuerpo['rehydration']);
    for (const prohibido of [analisis.id, diagnostico.rows[0]!.id, FECHA_SEMBRADA]) {
      expect(rehidratacion, prohibido).not.toContain(prohibido);
    }
    expect(reenviado.texto).not.toContain(diagnostico.rows[0]!.id);
    for (const clave of ['analysisId', 'dataLinks', 'resourceId', 'recordedDate', 'createdAt']) {
      expect(reenviado.texto, clave).not.toContain(`"${clave}"`);
    }
  });

  it('responde 502 y no reintenta más cuando el reenvío vuelve a recibir HILO_DESCONOCIDO [US-258 AC-6] [S6 resp. 9]', async () => {
    const { app } = await montarGateway(mundo, {
      identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
    });
    const conversationId = await abrirConversacion(app, cookie, patientId);
    await sembrarTresTurnos(conversationId);
    rag.chat.responder(HILO_DESCONOCIDO);

    const respuesta = await enviarTurno(app, cookie, conversationId, '¿Qué evidencia existe?');

    expect(respuesta.status).toBe(502);
    expect(respuesta.body.error).toBe('ERROR_SERVICIO_IA');
    expect(rag.chat.llamadas()).toBe(2);
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(3);
  });

  it('no reenvía ni reintenta cuando el primer turno ya llevaba la rehidratación vacía y Backend 2 responde HILO_DESCONOCIDO [US-258 AC-6] [ADR-51]', async () => {
    const { app } = await montarGateway(mundo, {
      identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
    });
    const conversationId = await abrirConversacion(app, cookie, patientId);
    rag.chat.responder(HILO_DESCONOCIDO);

    const respuesta = await enviarTurno(app, cookie, conversationId, '¿Qué evidencia existe?');

    expect(respuesta.status).toBe(502);
    expect(rag.chat.llamadas()).toBe(1);
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
  });
});
