import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import chatTurnCasoIntervalo from '../../../../../contracts/examples/chat-turn-caso-intervalo.json' with { type: 'json' };
import chatTurnRequestIntervalo from '../../../../../contracts/examples/chat-turn-request-caso-intervalo.json' with { type: 'json' };
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import { IDENTIDAD_CHAT, abrirConversacion, enviarTurno } from '../../support/conversacion.js';
import {
  abrirSesion,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

/**
 * `relativeEndDay` en el turno de caso (L1D-330, US-272): el cuerpo que `clinical-api` envía a Backend 2 trae el día de
 * fin del tratamiento previo como entero (con `endedAt`) o `null` explícito (en curso), y ninguna fecha absoluta (RN-11).
 * El intervalo del ejemplo del contrato (inicio −160, fin −60) fija la duración que se siembra.
 */
const ESPACIO_DE_IDS = 9832;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-conversacion-intervalo-0001';
const PREGUNTA_DE_PERIODO = '¿Qué ocurrió en los últimos 100 días?';
const FECHA_ABSOLUTA = /\d{4}-\d{2}-\d{2}/;

interface HechoEnviado {
  kind: string;
  relativeDay: number | null;
  relativeEndDay?: number | null;
}

const ejemplo = chatTurnRequestIntervalo.caseFacts.find((h) => h.kind === 'tratamiento');
const DURACION_EN_DIAS = (ejemplo?.relativeEndDay ?? 0) - (ejemplo?.relativeDay ?? 0);

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
const pacienteB = idSembrado('paciente-b');

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_conversacion_intervalo', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

async function turnoDePeriodo() {
  const { app } = await montarGateway(mundo, {
    identidades: lectorDeIdentidadFalso({ [pacienteB]: IDENTIDAD_CHAT }),
  });
  const conversationId = await abrirConversacion(app, cookie, pacienteB);
  rag.chat.responder({ tipo: 'json', status: 200, cuerpo: chatTurnCasoIntervalo });
  const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_PERIODO);
  const enviado = rag.chat.capturadas.at(-1)?.cuerpo as { caseFacts: HechoEnviado[] } | undefined;
  const tratamiento = enviado?.caseFacts.find((h) => h.kind === 'tratamiento');
  return { respuesta, tratamiento, texto: JSON.stringify(enviado ?? {}) };
}

describe('Tratamiento previo con intervalo en el turno de caso', () => {
  it('envía relativeEndDay como entero y ninguna fecha absoluta cuando el tratamiento tiene fecha de fin [US-272 AC-1] [AC-02.1] [RN-11]', async () => {
    await mundo.cliente.query(
      `UPDATE clinical.prior_treatment SET ended_at = started_at + $2::int, ongoing = false WHERE patient_id = $1`,
      [pacienteB, DURACION_EN_DIAS],
    );

    const { respuesta, tratamiento, texto } = await turnoDePeriodo();

    expect(respuesta.status).toBe(201);
    expect(tratamiento?.relativeDay).not.toBeNull();
    expect(tratamiento?.relativeEndDay).toBe((tratamiento?.relativeDay ?? 0) + DURACION_EN_DIAS);
    expect(texto).not.toMatch(FECHA_ABSOLUTA);
  });

  it('serializa "relativeEndDay":null cuando el tratamiento está en curso sin fecha de fin [US-272 AC-2] [AC-02.1]', async () => {
    await mundo.cliente.query(
      `UPDATE clinical.prior_treatment SET ended_at = NULL, ongoing = true WHERE patient_id = $1`,
      [pacienteB],
    );

    const { tratamiento, texto } = await turnoDePeriodo();

    expect(tratamiento).toHaveProperty('relativeEndDay', null);
    expect(texto).toContain('"relativeEndDay":null');
  });

  it('omite relativeEndDay cuando el fin es desconocido (ongoing = false sin fecha de fin) [US-272 AC-2] [AC-02.1]', async () => {
    await mundo.cliente.query(
      `UPDATE clinical.prior_treatment SET ended_at = NULL, ongoing = false WHERE patient_id = $1`,
      [pacienteB],
    );

    const { tratamiento } = await turnoDePeriodo();

    expect(tratamiento).not.toHaveProperty('relativeEndDay');
  });
});
