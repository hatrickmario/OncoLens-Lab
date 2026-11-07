import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import {
  DOCUMENTO_SINTETICO_CHAT,
  NACIMIENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
  PACIENTE_CHAT,
} from '../../../prisma/seed/pacientes/chat.js';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  IDENTIDAD_CHAT,
  PREGUNTA_FX_12_D,
  abrirConversacion,
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
 * US-269 (L1D-326), AC-6 en `clinical-api`: la pregunta FX-12-d sobre el paciente `P-CHAT` del seed no deja nombre,
 * documento ni fecha de nacimiento en los cuerpos hacia `/chat/turn`. Regresión de US-258 AC-4 con el paciente que usa
 * la suite `evaluate`: si falla, `eval:chat-preparar` dejaría de medir el camino de producción.
 */
const ESPACIO_DE_IDS = 9871;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-chat-evaluate-no-fuga-0001';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
const patientId = idSembrado(PACIENTE_CHAT);

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_chat_evaluate_no_fuga', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

describe('Cuerpos hacia /chat/turn con la pregunta FX-12-d sobre P-CHAT (RN-10, RN-11)', () => {
  it('no deja el nombre, el documento ni la fecha de nacimiento en ningún cuerpo hacia /chat/turn cuando la pregunta FX-12-d los trae [US-269 AC-6]', async () => {
    const { app } = await montarGateway(mundo, {
      identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
    });
    const conversationId = await abrirConversacion(app, cookie, patientId);

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_FX_12_D);

    expect(respuesta.status).toBe(201);
    expect(rag.chat.capturadas).toHaveLength(1);
    for (const captura of rag.chat.capturadas) {
      for (const prohibido of [
        NOMBRE_SINTETICO_CHAT,
        DOCUMENTO_SINTETICO_CHAT,
        NACIMIENTO_SINTETICO_CHAT,
      ]) {
        expect(captura.texto, prohibido).not.toContain(prohibido);
      }
    }
  });
});
