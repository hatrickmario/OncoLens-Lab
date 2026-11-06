import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import chatTurnLlmNoDisponible from '../../../../../contracts/examples/chat-turn-llm-local-no-disponible.json' with { type: 'json' };
import ragCatalogoDistinto from '../../../../../contracts/examples/rag-catalog-version-mismatch.json' with { type: 'json' };
import ragSalidaInvalida from '../../../../../contracts/examples/rag-salida-llm-invalida.json' with { type: 'json' };
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  IDENTIDAD_CHAT,
  PREGUNTA_DE_CASO,
  abrirConversacion,
  contarTurnosDeChat,
  enviarTurno,
  instalarFalloDeEscrituraDelTurnoDeChat,
} from '../../support/conversacion.js';
import {
  abrirSesion,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 9790;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-conversacion-fallos-0001';
const TEXTO_DEL_FALLO_DE_ESCRITURA = 'fallo-sintetico-de-escritura-del-turno';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let patientId: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_conversacion_fallos', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  patientId = await crearPacienteFxT4aA(mundo);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

async function conversacionNueva() {
  const { app, logger } = await montarGateway(mundo, {
    identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
  });
  return { app, logger, conversationId: await abrirConversacion(app, cookie, patientId) };
}

describe('Un fallo al persistir nunca muestra la respuesta (RN-06)', () => {
  it('responde 500 sin la respuesta generada ni el texto del error cuando falla el INSERT del turno [US-258 AC-3] [RN-06]', async () => {
    const { app, logger, conversationId } = await conversacionNueva();
    const quitar = await instalarFalloDeEscrituraDelTurnoDeChat(
      mundo.cliente,
      TEXTO_DEL_FALLO_DE_ESCRITURA,
    );
    try {
      const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_CASO);

      // Backend 2 sí respondió: el 500 viene de la escritura que falló, no de un turno que nunca se intentó.
      expect(rag.chat.llamadas()).toBe(1);
      expect(respuesta.status).toBe(500);
      expect(respuesta.body.error).toBe('ERROR_INTERNO');
      expect(respuesta.text).not.toContain('Carcinoma ductal');
      expect(respuesta.text).not.toContain(TEXTO_DEL_FALLO_DE_ESCRITURA);
      expect(logger.texto()).not.toContain('Carcinoma ductal');
    } finally {
      await quitar();
    }
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
  });
});

describe('Backend 2 caído no persiste ni inventa el turno (RN-06, RN-12)', () => {
  it('responde 502 ERROR_SERVICIO_IA sin guardar el turno cuando rag-orchestrator es inalcanzable [US-258 AC-7] [RN-06] [RN-12]', async () => {
    const { app, conversationId } = await conversacionNueva();
    rag.chat.responder({ tipo: 'red' });

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_CASO);

    expect(respuesta.status).toBe(502);
    expect(respuesta.body.error).toBe('ERROR_SERVICIO_IA');
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
  });

  it.each([
    ['LOCAL_LLM_UNAVAILABLE', chatTurnLlmNoDisponible],
    ['LLM_OUTPUT_INVALID', ragSalidaInvalida],
  ])(
    'responde 503 %s sin guardar el turno cuando Backend 2 no tiene LLM local o su salida no es válida [US-258 AC-7] [RN-06] [RN-12]',
    async (codigo, cuerpo) => {
      const { app, conversationId } = await conversacionNueva();
      rag.chat.responder({ tipo: 'json', status: 503, cuerpo });

      const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_CASO);

      expect(respuesta.status).toBe(503);
      expect(respuesta.body.error).toBe(codigo);
      // Sin otro proveedor: una sola llamada a Backend 2.
      expect(rag.chat.llamadas()).toBe(1);
      expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
    },
  );

  it('responde 409 CATALOG_VERSION_MISMATCH sin guardar el turno cuando el catálogo difiere entre los backends [US-258 AC-7] [RN-29]', async () => {
    const { app, conversationId } = await conversacionNueva();
    rag.chat.responder({ tipo: 'json', status: 409, cuerpo: ragCatalogoDistinto });

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_CASO);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error).toBe('CATALOG_VERSION_MISMATCH');
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
  });

  it('responde 502 sin guardar el turno cuando la respuesta de Backend 2 no cumple el contrato [US-258 AC-7] [RN-06]', async () => {
    const { app, conversationId } = await conversacionNueva();
    rag.chat.responder({ tipo: 'json', status: 200, cuerpo: { intent: 'caso' } });

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_CASO);

    expect(respuesta.status).toBe(502);
    expect(respuesta.body.error).toBe('ERROR_SERVICIO_IA');
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
  });
});
