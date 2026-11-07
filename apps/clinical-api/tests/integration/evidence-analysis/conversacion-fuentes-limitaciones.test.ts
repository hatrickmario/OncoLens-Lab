import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import chatTurnEvidencia from '../../../../../contracts/examples/chat-turn-evidencia.json' with { type: 'json' };
import chatTurnFuentes from '../../../../../contracts/examples/chat-turn-fuentes-ok.json' with { type: 'json' };
import chatTurnFuentesSinConsulta from '../../../../../contracts/examples/chat-turn-fuentes-sin-consulta.json' with { type: 'json' };
import chatTurnFuentesSinEvidencia from '../../../../../contracts/examples/chat-turn-fuentes-sin-evidencia.json' with { type: 'json' };
import ragNliNoDisponible from '../../../../../contracts/examples/rag-nli-no-disponible.json' with { type: 'json' };
import ragRecuperacionNoDisponible from '../../../../../contracts/examples/rag-recuperacion-no-disponible.json' with { type: 'json' };
import chatTurnHiloDesconocido from '../../../../../contracts/examples/chat-turn-hilo-desconocido.json' with { type: 'json' };
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import { PACIENTE_CHAT } from '../../../prisma/seed/pacientes/chat.js';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  IDENTIDAD_CHAT,
  abrirConversacion,
  contarTurnosDeChat,
  enviarTurno,
  leerTurnosDeChat,
} from '../../support/conversacion.js';
import { filaDePaciente, insertar } from '../../support/filas-sinteticas.js';
import {
  abrirSesion,
  contarAnalisisDelPaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type EscenarioDeRag,
  type MundoDeGateway,
} from '../../support/gateway.js';

/**
 * Fuentes y limitaciones del chat (L1D-323, US-266): el turno `sin_evidencia` se registra con `topRelevanceScore = null`
 * y el estado estructurado sin `analysisId` viaja intacto al rehidratar; los bloques `fuente` y `limitacion` son
 * deterministas y pasan sin cita. Datos sintéticos (`P-CHAT`).
 */
const ESPACIO_DE_IDS = 9870;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-conversacion-fuentes-0001';
const PREGUNTA_DE_EVIDENCIA = '¿Qué describe la evidencia sobre melanoma uveal?';
const PREGUNTA_DE_FUENTES = '¿Cuáles son las fuentes y las limitaciones?';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let contadorDeTrace = 0;
const pacienteChat = idSembrado(PACIENTE_CHAT);

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_conversacion_fuentes', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const traceDelTurno = (): string => `req_Fuen${String(++contadorDeTrace).padStart(6, '0')}`;

async function conversacionSobre(patientId: string) {
  const { app } = await montarGateway(mundo, {
    analysisMaxOptions: 3,
    identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
    traceIds: { traceId: traceDelTurno },
  });
  const conversationId = await abrirConversacion(app, cookie, patientId);
  return { app, conversationId };
}

const respuestaDeRag = (cuerpo: unknown, status = 200): EscenarioDeRag => ({
  tipo: 'json',
  status,
  cuerpo: cuerpo as Record<string, unknown>,
});

describe('Turno de evidencia sin evidencia en el chat', () => {
  it('persiste el análisis sin_evidencia con puntaje null y sin opciones, enlazado al turno, y responde con las limitaciones de la recuperación [US-266 AC-5] [RN-02] [RN-06] [AC-06.2]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    rag.chat.responder(respuestaDeRag(chatTurnFuentesSinEvidencia));

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      intent: 'evidencia',
      status: 'sin_evidencia',
      topRelevanceScore: null,
    });
    expect(respuesta.body.evidenceAnalysis).toMatchObject({
      status: 'sin_evidencia',
      topRelevanceScore: null,
      evidenceOptions: [],
    });
    const [turno] = await leerTurnosDeChat(mundo.cliente, conversationId);
    expect(turno?.analysis_id).toBe(respuesta.body.analysisId);
    const registro = await leerRegistroPorTrace(mundo.cliente, turno?.trace_id ?? '');
    expect(registro).toMatchObject({
      id: respuesta.body.analysisId,
      status: 'sin_evidencia',
      top_relevance_score: null,
      evidence_options: [],
    });
    const bloques = chatTurnFuentesSinEvidencia.blocks;
    expect(respuesta.body.blocks).toEqual(bloques);
    expect(bloques.map((b) => b.kind)).toEqual(['limitacion', 'limitacion']);
    expect(bloques[1]?.text).toMatch(/fecha de corte/);
    expect(bloques[1]?.text).toMatch(/fuentes no incluidas/);
    expect(bloques[1]?.text).toMatch(/fragmentos de evidencia evaluados/);
    expect(respuesta.body.notices).toEqual(chatTurnFuentesSinEvidencia.notices);
    const estado = JSON.stringify(turno?.structured_state);
    expect(estado).not.toContain('analysisId');
    expect(turno?.structured_state).toMatchObject({
      ultimaEvidencia: { topRelevanceScore: null },
    });
  });

  it('reenvía ultimaEvidencia con puntaje null y sin analysisId cuando rehidrata el hilo después de un turno sin evidencia [US-266 AC-5] [ADR-51]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    rag.chat.responder(
      respuestaDeRag(chatTurnFuentesSinEvidencia),
      respuestaDeRag(chatTurnHiloDesconocido, 404),
      respuestaDeRag(chatTurnFuentesSinConsulta),
    );
    await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_FUENTES);

    expect(respuesta.status).toBe(201);
    const rehidratacion = rag.chat.capturadas.at(-1)?.cuerpo['rehydration'] as {
      structuredState: { ultimaEvidencia: Record<string, unknown> };
    };
    expect(rehidratacion.structuredState.ultimaEvidencia).toEqual(
      chatTurnFuentesSinEvidencia.structuredState.ultimaEvidencia,
    );
    expect(rehidratacion.structuredState.ultimaEvidencia['topRelevanceScore']).toBeNull();
    expect(JSON.stringify(rehidratacion)).not.toContain('analysisId');
  });
});

describe('Turno de fuentes y limitaciones', () => {
  it('persiste los bloques fuente y limitacion sin cita ni análisis nuevo y responde 201 validado contra el spec [US-266 AC-1] [RN-04] [AC-T1.3]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    const registros = await contarAnalisisDelPaciente(mundo.cliente, pacienteChat);
    rag.chat.responder(respuestaDeRag(chatTurnFuentes));

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_FUENTES);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ intent: 'fuentes_limitaciones' });
    expect(respuesta.body.blocks).toEqual(chatTurnFuentes.blocks);
    expect(respuesta.body.blocks.some((b: { kind: string }) => b.kind === 'fuente')).toBe(true);
    expect(
      respuesta.body.blocks.every(
        (b: Record<string, unknown>) => !('citations' in b) && !('chunkId' in b),
      ),
    ).toBe(true);
    expect(respuesta.body.notices).toEqual(chatTurnFuentes.notices);
    expect(await contarAnalisisDelPaciente(mundo.cliente, pacienteChat)).toBe(registros);
    const [turno] = await leerTurnosDeChat(mundo.cliente, conversationId);
    expect(turno?.analysis_id).toBeNull();
  });

  it('responde 201 con el aviso de que no se consultó evidencia y sin fuentes cuando el hilo no tiene evidencia [US-266 AC-6]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    rag.chat.responder(respuestaDeRag(chatTurnFuentesSinConsulta));

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_FUENTES);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.blocks).toEqual(chatTurnFuentesSinConsulta.blocks);
    expect(respuesta.body.blocks.map((b: { kind: string }) => b.kind)).toEqual(['limitacion']);
  });
});

describe('Fallo cerrado del corpus en el turno de fuentes', () => {
  it.each([
    ['RETRIEVAL_UNAVAILABLE', ragRecuperacionNoDisponible],
    ['NLI_UNAVAILABLE', ragNliNoDisponible],
  ])(
    'responde 502 sin persistir el turno cuando rag-orchestrator responde 503 %s [US-266 AC-1] [RN-01] [RN-06]',
    async (_codigo, cuerpo) => {
      const { app, conversationId } = await conversacionSobre(pacienteChat);
      rag.chat.responder(respuestaDeRag(cuerpo, 503));

      const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_FUENTES);

      expect(respuesta.status).toBe(502);
      expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
    },
  );
});

describe('Turno de evidencia de un paciente sin episodio de atención', () => {
  it('responde 500 sin persistir turno ni análisis cuando el paciente no tiene episodio para enlazar el registro [US-265 AC-1] [RN-06]', async () => {
    const paciente = await insertar(
      mundo.cliente,
      'clinical.patient',
      filaDePaciente(mundo.ids, { data_origin: 'sintetico' }),
    );
    const patientId = paciente['id'] as string;
    const { app, conversationId } = await conversacionSobre(patientId);
    rag.chat.responder(respuestaDeRag(chatTurnEvidencia));

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);

    expect(respuesta.status).toBe(500);
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
    expect(await contarAnalisisDelPaciente(mundo.cliente, patientId)).toBe(0);
  });
});
