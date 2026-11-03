import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import {
  abrirSesion,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import {
  crearAnalisisConEvidencia,
  leerTurnos,
  rutaDeSeguimiento,
} from '../../support/seguimiento.js';

const ESPACIO_DE_IDS = 9660;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-seguimiento-nfc-0001';

// Pregunta de la Demo 4 (OUT-05): se ve igual en NFC y NFD, pero el LLM recibe otros tokens.
const PREGUNTA_NFC =
  '¿Qué indican las pruebas científicas sobre la opción 2 en el cáncer de mama HER2-positivo?'.normalize(
    'NFC',
  );
const PREGUNTA_NFD = `  ${PREGUNTA_NFC.normalize('NFD').replace(' indican', '\u{a0}\u{a0}indican\t')}\u{3000} `;

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_seguimiento_nfc', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const bytes = (texto: string): string => Buffer.from(texto, 'utf8').toString('hex');

async function prepararAnalisis() {
  const { app } = await montarGateway(mundo, { analysisMaxOptions: 3 });
  const analisis = await crearAnalisisConEvidencia(app, cookie, rag, idDePaciente('a'));
  rag.reiniciar();
  return { app, analisis };
}

describe('normalización de la pregunta de seguimiento en el borde (US-250)', () => {
  it('normaliza a NFC y mide la longitud tras normalizar cuando la pregunta llega en NFD con espacios Unicode [US-218 AC-1] [US-250 AC-1]', async () => {
    const { app, analisis } = await prepararAnalisis();
    expect(PREGUNTA_NFD).not.toBe(PREGUNTA_NFC);

    const respuesta = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie)
      .send({ question: PREGUNTA_NFD });

    expect(respuesta.status).toBe(201);
    const enviada = rag.seguimiento.capturadas[0]!.cuerpo['question'] as string;
    expect(bytes(enviada)).toBe(bytes(PREGUNTA_NFC));
    const [fila] = await leerTurnos(mundo.cliente, analisis.id);
    expect(bytes(fila!.question_text)).toBe(bytes(PREGUNTA_NFC));
    expect(bytes(respuesta.body.question)).toBe(bytes(PREGUNTA_NFC));
  });

  it('responde 422 CUERPO_INVALIDO sin llamar a la IA ni persistir turno cuando la pregunta son solo espacios [US-250 AC-3]', async () => {
    const { app, analisis } = await prepararAnalisis();

    const respuesta = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie)
      .send({ question: ' \u{a0}\t\u{3000} ' });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(rag.seguimiento.llamadas()).toBe(0);
    expect(await leerTurnos(mundo.cliente, analisis.id)).toEqual([]);
  });
});
