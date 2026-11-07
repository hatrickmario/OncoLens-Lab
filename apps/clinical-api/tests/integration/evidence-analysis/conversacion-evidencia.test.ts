import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import chatTurnEvidencia from '../../../../../contracts/examples/chat-turn-evidencia.json' with { type: 'json' };
import chatTurnLlmNoDisponible from '../../../../../contracts/examples/chat-turn-llm-local-no-disponible.json' with { type: 'json' };
import chatTurnSeguimiento from '../../../../../contracts/examples/chat-turn-seguimiento-evidencia.json' with { type: 'json' };
import ragAplicabilidad from '../../../../../contracts/examples/rag-query-aplicabilidad-a-m1.json' with { type: 'json' };
import ragSinEvidencia from '../../../../../contracts/examples/rag-query-sin-evidencia.json' with { type: 'json' };
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import { PACIENTE_CHAT } from '../../../prisma/seed/pacientes/chat.js';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  IDENTIDAD_CHAT,
  abrirConversacion,
  contarTurnosDeChat,
  enviarTurno,
  leerTurnosDeChat,
  rutaDeConversacion,
  sembrarTurnoDeChat,
} from '../../support/conversacion.js';
import { registrarMarca } from '../../support/opt-out.js';
import { crearAnalisisConEvidencia } from '../../support/seguimiento.js';
import {
  abrirSesion,
  contarAnalisisDelPaciente,
  crearPacienteSintetico,
  instalarFalloDeEscrituraDelRegistro,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

/**
 * Turno de evidencia del chat (L1D-322, US-265): el `AIAnalysisRecord` y el turno se persisten en una sola transacción antes
 * de responder (RN-06); el seguimiento referencia el análisis activo sin crear otro. Datos sintéticos (`P-CHAT`, (e)).
 */
const ESPACIO_DE_IDS = 9860;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-conversacion-evidencia-0001';
const PREGUNTA_DE_EVIDENCIA =
  '¿Qué evidencia existe para pacientes con las características de este paciente?';
const PREGUNTA_DE_SEGUIMIENTO = '¿En qué se diferencia la población del estudio de mi paciente?';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let contadorDeTrace = 0;
const pacienteChat = idSembrado(PACIENTE_CHAT);
const pacienteE = idSembrado('paciente-e');

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_conversacion_evidencia', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const traceDelTurno = (): string => `req_Evid${String(++contadorDeTrace).padStart(6, '0')}`;

async function conversacionSobre(patientId: string) {
  const { app } = await montarGateway(mundo, {
    analysisMaxOptions: 3,
    identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
    traceIds: { traceId: traceDelTurno },
  });
  const conversationId = await abrirConversacion(app, cookie, patientId);
  return { app, conversationId };
}

const respuestaDeRag = (cuerpo: unknown, status = 200) => ({
  tipo: 'json' as const,
  status,
  cuerpo: cuerpo as Record<string, unknown>,
});

describe('Turno de evidencia registrado como análisis', () => {
  it('persiste el AIAnalysisRecord y el turno con su analysis_id y responde desde lo persistido cuando el doctor pregunta por evidencia [US-265 AC-1] [FR-09] [RN-06] [AC-10.1] [AC-T1.4]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    rag.chat.responder(respuestaDeRag(chatTurnEvidencia));

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.intent).toBe('evidencia');
    expect(respuesta.body.analysisId).toEqual(expect.any(String));
    expect(respuesta.body.evidenceAnalysis.id).toBe(respuesta.body.analysisId);
    const [turno] = await leerTurnosDeChat(mundo.cliente, conversationId);
    expect(turno?.analysis_id).toBe(respuesta.body.analysisId);
    const registro = await leerRegistroPorTrace(mundo.cliente, turno?.trace_id ?? '');
    expect(registro).toMatchObject({
      id: respuesta.body.analysisId,
      analysis_type: 'analisis_evidencia',
      trace_id: turno?.trace_id,
      corpus_release: chatTurnEvidencia.evidenceAnalysis.meta.corpusRelease,
      catalog_version: chatTurnEvidencia.evidenceAnalysis.meta.catalogVersion,
      prompt_version: chatTurnEvidencia.evidenceAnalysis.meta.promptVersion,
    });
    expect(registro?.evidence_options).toEqual(respuesta.body.evidenceAnalysis.evidenceOptions);
    expect(registro?.retrieval_params).toEqual(
      chatTurnEvidencia.evidenceAnalysis.meta.retrievalParams,
    );
  });

  it('deja 500 sin análisis ni turno cuando falla el INSERT del registro [US-265 AC-1] [RN-06]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    const antes = await contarAnalisisDelPaciente(mundo.cliente, pacienteChat);
    rag.chat.responder(respuestaDeRag(chatTurnEvidencia));
    const quitar = await instalarFalloDeEscrituraDelRegistro(
      mundo.cliente,
      'SINT-fallo-registro-chat',
    );

    try {
      const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);

      expect(respuesta.status).toBe(500);
      expect(respuesta.body.evidenceAnalysis).toBeUndefined();
      expect(JSON.stringify(respuesta.body)).not.toContain('SINT-fallo-registro-chat');
    } finally {
      await quitar();
    }
    expect(await contarAnalisisDelPaciente(mundo.cliente, pacienteChat)).toBe(antes);
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
  });

  it('persiste la aplicabilidad igual a la respondida y no envía estado menopáusico con el paciente (e) [US-265 AC-2] [AC-04.3] [RN-28]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteE);
    // FX-T3-a: el análisis del paciente (e) trae el criterio de menopausia Desconocido por falta en el paciente.
    const cuerpo = { ...chatTurnEvidencia, evidenceAnalysis: ragAplicabilidad };
    rag.chat.responder(respuestaDeRag(cuerpo));

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);

    expect(respuesta.status).toBe(201);
    const enviado = rag.chat.capturadas.at(-1)?.cuerpo as {
      clinicalContext: { attributes: unknown[]; missingCriticalData: string[] };
    };
    expect(JSON.stringify(enviado.clinicalContext.attributes)).not.toMatch(/menopa/i);
    expect(enviado.clinicalContext.missingCriticalData.join(' ')).toMatch(/menopa/i);
    const [turno] = await leerTurnosDeChat(mundo.cliente, conversationId);
    const registro = await leerRegistroPorTrace(mundo.cliente, turno?.trace_id ?? '');
    expect(registro?.applicability).toEqual(respuesta.body.evidenceAnalysis.applicability);
    expect(
      respuesta.body.evidenceAnalysis.evidenceOptions.map((o: { option: string }) => o.option),
    ).toEqual(cuerpo.evidenceAnalysis.evidenceOptions.map((o) => o.option));
    const menopausia = respuesta.body.evidenceAnalysis.applicability
      .flatMap((f: { criteria: { criterion: string }[] }) => f.criteria)
      .find((c: { criterion: string }) => c.criterion === 'estado_menopausico');
    expect(menopausia).toMatchObject({ status: 'desconocido', unknownReason: 'falta_en_paciente' });
  });
});

describe('Seguimiento del análisis activo', () => {
  it('envía activeAnalysisId y enlaza el seguimiento al mismo análisis sin registro nuevo [US-265 AC-3] [S6 resp. 6]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    rag.chat.responder(respuestaDeRag(chatTurnEvidencia), respuestaDeRag(chatTurnSeguimiento));
    const primero = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);
    const registros = await contarAnalisisDelPaciente(mundo.cliente, pacienteChat);

    const segundo = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_SEGUIMIENTO);

    expect(segundo.status).toBe(201);
    expect(rag.chat.capturadas[0]?.cuerpo).not.toHaveProperty('activeAnalysisId');
    expect(rag.chat.capturadas[1]?.cuerpo).toMatchObject({
      activeAnalysisId: primero.body.analysisId,
    });
    expect(segundo.body.analysisId).toBe(primero.body.analysisId);
    expect(segundo.body.evidenceAnalysis).toBeUndefined();
    expect(await contarAnalisisDelPaciente(mundo.cliente, pacienteChat)).toBe(registros);
  });

  it('responde 502 ErrorServicioIa sin persistir si llega seguimiento sin análisis activo [US-265 AC-3] [RN-06]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    rag.chat.responder(respuestaDeRag(chatTurnSeguimiento));

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_SEGUIMIENTO);

    expect(rag.chat.capturadas[0]?.cuerpo).not.toHaveProperty('activeAnalysisId');
    expect(respuesta.status).toBe(502);
    expect(respuesta.body.error).toBe('ERROR_SERVICIO_IA');
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
  });
});

describe('LLM local caído en el turno de evidencia', () => {
  it('responde 503 sin análisis ni turno cuando rag-orchestrator informa LOCAL_LLM_UNAVAILABLE [US-265 AC-6] [RN-12] [AC-06.1]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    const antes = await contarAnalisisDelPaciente(mundo.cliente, pacienteChat);
    rag.chat.responder(respuestaDeRag(chatTurnLlmNoDisponible, 503));

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);

    expect(respuesta.status).toBe(503);
    expect(await contarAnalisisDelPaciente(mundo.cliente, pacienteChat)).toBe(antes);
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
  });
});

describe('Lectura de la conversación', () => {
  it('trae evidenceAnalysis solo en el turno que creó el análisis y deriva status y topRelevanceScore reales [US-265 AC-1] [AC-10.1]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    rag.chat.responder(respuestaDeRag(chatTurnEvidencia), respuestaDeRag(chatTurnSeguimiento));
    await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);
    await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_SEGUIMIENTO);

    const lectura = await clienteVerificado(app)
      .get(rutaDeConversacion(conversationId))
      .set('Cookie', cookie);

    expect(lectura.status).toBe(200);
    const [analisis, seguimiento] = lectura.body.turns;
    expect(analisis.evidenceAnalysis.id).toBe(analisis.analysisId);
    expect(analisis).toMatchObject({
      status: 'respondido',
      topRelevanceScore: chatTurnEvidencia.evidenceAnalysis.topRelevanceScore,
    });
    expect(seguimiento.evidenceAnalysis).toBeUndefined();
    expect(seguimiento.analysisId).toBe(analisis.analysisId);
    expect(seguimiento.topRelevanceScore).toBe(
      chatTurnSeguimiento.structuredState.ultimaEvidencia.topRelevanceScore,
    );
  });
});

describe('Respuestas incoherentes o de proveedor no permitido de Backend 2', () => {
  it('responde 502 sin persistir cuando el análisis es incoherente: sin_evidencia con opciones y puntaje [US-265 AC-1] [RN-02] [RN-06]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    const incoherente = structuredClone(chatTurnEvidencia);
    incoherente.evidenceAnalysis.status = 'sin_evidencia';
    rag.chat.responder(respuestaDeRag(incoherente));

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);

    expect(respuesta.status).toBe(502);
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
  });

  it('responde 502 sin persistir cuando un seguimiento trae evidenceAnalysis: el seguimiento no crea análisis [US-265 AC-3]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    rag.chat.responder(respuestaDeRag(chatTurnEvidencia), {
      ...respuestaDeRag({
        ...chatTurnSeguimiento,
        evidenceAnalysis: chatTurnEvidencia.evidenceAnalysis,
      }),
    });
    await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);
    const registros = await contarAnalisisDelPaciente(mundo.cliente, pacienteChat);

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_SEGUIMIENTO);

    expect(respuesta.status).toBe(502);
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(1);
    expect(await contarAnalisisDelPaciente(mundo.cliente, pacienteChat)).toBe(registros);
  });

  it('responde 502 sin persistir cuando el turno de evidencia declara nube con datos reales [RN-12] [US-265 AC-6]', async () => {
    const { app, conversationId, patientId } = await conversacionReal();
    const nube = structuredClone(chatTurnEvidencia);
    nube.llmProvider = 'nube';
    rag.chat.responder(respuestaDeRag(nube));

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);

    expect(respuesta.status).toBe(502);
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
    expect(await contarAnalisisDelPaciente(mundo.cliente, patientId)).toBe(0);
  });

  it('responde 502 sin persistir cuando el turno de SEGUIMIENTO declara nube con datos reales [RN-12] [US-265 AC-3]', async () => {
    const { app, conversationId, patientId } = await conversacionReal();
    const analisis = await crearAnalisisConEvidencia(app, cookie, rag, patientId);
    await sembrarTurnoDeChat(mundo, conversationId, {
      turnNumber: 1,
      question: PREGUNTA_DE_EVIDENCIA,
      intent: 'evidencia',
      analysisId: analisis.id,
    });
    rag.reiniciar();
    const registros = await contarAnalisisDelPaciente(mundo.cliente, patientId);
    rag.chat.responder(respuestaDeRag({ ...chatTurnSeguimiento, llmProvider: 'nube' }));

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_SEGUIMIENTO);

    expect(respuesta.status).toBe(502);
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(1);
    expect(await contarAnalisisDelPaciente(mundo.cliente, patientId)).toBe(registros);
  });
});

async function conversacionReal() {
  const patientId = await crearPacienteSintetico(mundo, {
    dataOrigin: 'real_anonimizado',
    conDiagnostico: true,
  });
  const { app } = await montarGateway(mundo, {
    omitirGuardaDeEntornoSintetico: true,
    analysisMaxOptions: 3,
    identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
    traceIds: { traceId: traceDelTurno },
  });
  const conversationId = await abrirConversacion(app, cookie, patientId);
  return { app, conversationId, patientId };
}

describe('Turno de evidencia sin evidencia, Base y opt-out', () => {
  it('registra sin_evidencia con puntaje null y responde status sin_evidencia cuando Backend 2 no encuentra evidencia [US-265 AC-1] [RN-02]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    rag.chat.responder(
      respuestaDeRag({
        ...chatTurnEvidencia,
        evidenceAnalysis: ragSinEvidencia,
        blocks: [{ kind: 'limitacion', text: ragSinEvidencia.limitations[0]?.text }],
      }),
    );

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ status: 'sin_evidencia', topRelevanceScore: null });
    expect(respuesta.body.evidenceAnalysis).toMatchObject({
      status: 'sin_evidencia',
      topRelevanceScore: null,
    });
    const [turno] = await leerTurnosDeChat(mundo.cliente, conversationId);
    const registro = await leerRegistroPorTrace(mundo.cliente, turno?.trace_id ?? '');
    expect(registro).toMatchObject({ status: 'sin_evidencia', top_relevance_score: null });
  });

  it('declara en la Base los filtros y el maxOptions con los que consultó Backend 2: sin año mínimo y 3 opciones [US-265 AC-1] [AC-T1.4]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    rag.chat.responder(respuestaDeRag(chatTurnEvidencia));

    await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);

    const [turno] = await leerTurnosDeChat(mundo.cliente, conversationId);
    const registro = await leerRegistroPorTrace(mundo.cliente, turno?.trace_id ?? '');
    expect(registro?.filters_applied).toMatchObject({ publishedFromYear: null });
    expect(registro?.analysis_basis).toMatchObject({
      maxOptions: 3,
      sourcesConsulted: { filters: { publishedFromYear: null } },
    });
  });

  it('responde 403 OPT_OUT_ANALISIS_IA sin llamar a rag-orchestrator ni crear análisis cuando el paciente tiene opt-out en el turno de evidencia [US-148 AC-1] [RN-15]', async () => {
    const { app, conversationId } = await conversacionSobre(pacienteChat);
    await registrarMarca(mundo, pacienteChat, { accion: 'registrado' });
    const antes = await contarAnalisisDelPaciente(mundo.cliente, pacienteChat);
    rag.chat.responder(respuestaDeRag(chatTurnEvidencia));

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_EVIDENCIA);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error).toBe('OPT_OUT_ANALISIS_IA');
    expect(rag.chat.llamadas()).toBe(0);
    expect(await contarAnalisisDelPaciente(mundo.cliente, pacienteChat)).toBe(antes);
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
  });
});
