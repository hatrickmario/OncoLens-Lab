import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import chatTurnCasoOk from '../../../../../contracts/examples/chat-turn-caso-ok.json' with { type: 'json' };
import chatTurnLlmNoDisponible from '../../../../../contracts/examples/chat-turn-llm-local-no-disponible.json' with { type: 'json' };
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import {
  DOCUMENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
  PACIENTE_CHAT,
} from '../../../prisma/seed/pacientes/chat.js';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  IDENTIDAD_CHAT,
  PREGUNTA_DE_CASO,
  abrirConversacion,
  contarTurnosDeChat,
  enviarTurno,
} from '../../support/conversacion.js';
import {
  abrirSesion,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

/**
 * Turno de caso del chat (L1D-317, US-260): `caseFacts` desidentificados con `factRef` opaco, datos vigentes y enlaces
 * ordenados por día relativo. `P-CHAT` (FX-12-b) y el paciente (b) vienen del seed sintético.
 */
const ESPACIO_DE_IDS = 9830;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-conversacion-caso-0001';
const PREGUNTA_PSA = '¿Cómo ha evolucionado el PSA?';

interface HechoEnviado {
  factRef: string;
  kind: string;
  verbalization: string;
  relativeDay: number | null;
  seriesKey?: string;
}

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
const pacienteChat = idSembrado(PACIENTE_CHAT);
const pacienteB = idSembrado('paciente-b');

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_conversacion_caso', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

async function turnoDeCaso(patientId: string, pregunta: string) {
  const { app } = await montarGateway(mundo, {
    identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
  });
  const conversationId = await abrirConversacion(app, cookie, patientId);
  const respuesta = await enviarTurno(app, cookie, conversationId, pregunta);
  const enviado = rag.chat.capturadas.at(-1)?.cuerpo as { caseFacts: HechoEnviado[] } | undefined;
  return { app, conversationId, respuesta, caseFacts: enviado?.caseFacts ?? [] };
}

describe('Turno de caso sobre P-CHAT', () => {
  it('devuelve los bloques documentados con sus enlaces y los avisos tal como los entrega Backend 2 cuando el doctor pregunta por la situación [US-260 AC-1] [AC-02.5] [RN-19]', async () => {
    const { respuesta, caseFacts } = await turnoDeCaso(pacienteChat, PREGUNTA_DE_CASO);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.intent).toBe('caso');
    expect(respuesta.body.blocks).toEqual(chatTurnCasoOk.blocks);
    expect(respuesta.body.notices).toEqual(chatTurnCasoOk.notices);
    expect(respuesta.body.notices).toContain('Verifique contra las fuentes');
    const citados = chatTurnCasoOk.blocks.flatMap((b) => b.factRefs);
    expect(respuesta.body.dataLinks.map((e: { factRef: string }) => e.factRef).sort()).toEqual(
      [...new Set(citados)].sort(),
    );
    for (const enlace of respuesta.body.dataLinks) {
      expect(enlace).toMatchObject({
        resourceId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        resourceType: expect.any(String),
        origin: expect.any(String),
      });
    }
    expect(caseFacts.length).toBeGreaterThan(0);
  });

  it('envía caseFacts sin nombre, documento, UUID ni fechas absolutas, con factRef opaco, verbalización y día relativo cuando el doctor pregunta [US-260 AC-4] [RN-10] [RN-11] [ADR-34]', async () => {
    const { caseFacts } = await turnoDeCaso(pacienteChat, PREGUNTA_DE_CASO);

    const texto = JSON.stringify(caseFacts);
    expect(caseFacts.length).toBeGreaterThan(1);
    expect(texto).not.toContain(NOMBRE_SINTETICO_CHAT);
    expect(texto).not.toContain(DOCUMENTO_SINTETICO_CHAT);
    expect(texto).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(texto).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    for (const hecho of caseFacts) {
      expect(hecho.factRef).toMatch(/^f[0-9]+$/);
      expect(hecho.verbalization.length).toBeGreaterThan(0);
      expect(hecho).toHaveProperty('relativeDay');
    }
  });

  it('excluye el HER2 2+ reemplazado e incluye la corrección 3+ marcada como corregida cuando se arman los caseFacts [US-260 AC-5] [AC-02.6] [RN-07]', async () => {
    const { caseFacts } = await turnoDeCaso(pacienteChat, PREGUNTA_DE_CASO);

    const her2 = caseFacts.filter((h) => h.verbalization.startsWith('HER2'));
    expect(her2.map((h) => h.verbalization)).toEqual(['HER2: 3+, relevante']);
    expect(her2[0]).toMatchObject({ reviewStatus: 'corregido', corrected: true });
  });
});

describe('Evolución de una serie', () => {
  it('devuelve los dataLinks de los tres PSA en orden ascendente de día relativo aunque Backend 2 los cite desordenados [US-260 AC-6] [AC-02.4]', async () => {
    const { app, conversationId, caseFacts } = await turnoDeCaso(pacienteB, PREGUNTA_PSA);
    const psa = caseFacts.filter((h) => h.seriesKey === 'psa');
    expect(psa).toHaveLength(3);
    const desordenados = [...psa].sort((a, b) => (b.relativeDay ?? 0) - (a.relativeDay ?? 0));
    rag.chat.responder({
      tipo: 'json',
      status: 200,
      cuerpo: {
        ...chatTurnCasoOk,
        blocks: desordenados.map((h) => ({
          kind: 'documentado',
          text: h.verbalization,
          factRefs: [h.factRef],
        })),
      },
    });

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_PSA);

    expect(respuesta.status).toBe(201);
    const dias = respuesta.body.dataLinks.map((e: { relativeDay: number }) => e.relativeDay);
    expect(dias).toEqual([...dias].sort((a: number, b: number) => a - b));
    expect(dias).toHaveLength(3);
  });
});

describe('LLM local caído', () => {
  it('responde 503 y no guarda el turno cuando rag-orchestrator informa que el LLM local no está disponible [US-260 AC-7] [RN-12] [RN-06]', async () => {
    const { app } = await montarGateway(mundo, {
      identidades: lectorDeIdentidadFalso({ [pacienteChat]: IDENTIDAD_CHAT }),
    });
    const conversationId = await abrirConversacion(app, cookie, pacienteChat);
    rag.chat.responder({ tipo: 'json', status: 503, cuerpo: chatTurnLlmNoDisponible });

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_CASO);

    expect(respuesta.status).toBe(503);
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
  });
});
