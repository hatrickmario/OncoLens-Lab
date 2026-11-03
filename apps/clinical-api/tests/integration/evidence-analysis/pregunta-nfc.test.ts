import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  TODAS_LAS_FUENTES,
  abrirSesion,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 3060;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-pregunta-nfc-0001';

// Pregunta de la Demo 4 (OUT-05): se ve igual en NFC y NFD, pero el LLM recibe otros tokens.
const PREGUNTA_NFC =
  '¿Qué indican las pruebas científicas sobre la terapia dirigida para el cáncer de mama HER2-positivo?'.normalize(
    'NFC',
  );
const PREGUNTA_NFD = PREGUNTA_NFC.normalize('NFD');

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_pregunta_nfc', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

async function analizar(query: string, traceId = 'req_NFC00001') {
  const { app } = await montarGateway(mundo, { traceIds: { traceId: () => traceId } });
  return clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({ patientId: idDePaciente('b'), query, sourcesSelected: TODAS_LAS_FUENTES });
}

const consultaEnviada = (): string => rag.capturadas[0]?.cuerpo['query'] as string;
const bytes = (texto: string): string => Buffer.from(texto, 'utf8').toString('hex');

describe('normalización de la pregunta en el borde del gateway', () => {
  it('persiste y envía la pregunta en NFC idéntica byte a byte cuando llega en NFD [US-250 AC-1]', async () => {
    expect(PREGUNTA_NFD).not.toBe(PREGUNTA_NFC);

    await analizar(PREGUNTA_NFD, 'req_NFC00001');

    expect(rag.llamadas()).toBe(1);
    expect(bytes(consultaEnviada())).toBe(bytes(PREGUNTA_NFC));
    const registro = await leerRegistroPorTrace(mundo.cliente, 'req_NFC00001');
    expect(registro).toBeDefined();
    expect(bytes(registro!.query_text)).toBe(bytes(PREGUNTA_NFC));
  });

  it('envía y persiste la pregunta sin espacios repetidos ni de los extremos y sin tocar mayúsculas ni puntuación cuando trae espacios Unicode [US-250 AC-2]', async () => {
    const sucia = `  ${PREGUNTA_NFC.replace(' indican', '\u{a0}\u{a0}indican\t')}\u{3000} `;

    await analizar(sucia, 'req_NFC00002');

    expect(rag.llamadas()).toBe(1);
    expect(consultaEnviada()).toBe(PREGUNTA_NFC);
    const registro = await leerRegistroPorTrace(mundo.cliente, 'req_NFC00002');
    expect(registro!.query_text).toBe(PREGUNTA_NFC);
  });

  it('acepta una pregunta NFD de 4000 caracteres que mide 2000 en NFC y la envía en NFC [US-250 AC-3]', async () => {
    const nfd = 'e\u{301}'.repeat(2000);
    expect(nfd.length).toBeGreaterThan(2000);

    const respuesta = await analizar(nfd, 'req_NFC00003');

    expect(respuesta.status).not.toBe(422);
    expect(rag.llamadas()).toBe(1);
    expect(consultaEnviada()).toBe('\u{e9}'.repeat(2000));
  });

  it('acepta una pregunta NFC de exactamente 2000 caracteres y rechaza la de 2001 con 422 sin llamar a la IA [US-250 AC-3]', async () => {
    const aceptada = await analizar('\u{e9}'.repeat(2000), 'req_NFC00004');
    expect(aceptada.status).not.toBe(422);
    expect(rag.llamadas()).toBe(1);

    rag.reiniciar();
    const rechazada = await analizar('\u{e9}'.repeat(2001), 'req_NFC00005');

    expect(rechazada.status).toBe(422);
    expect(rechazada.body.error).toBe('CUERPO_INVALIDO');
    expect(rag.llamadas()).toBe(0);
  });

  it('responde 422 CUERPO_INVALIDO sin llamar a la IA cuando la pregunta tiene solo espacios Unicode [US-250 AC-2]', async () => {
    const respuesta = await analizar(' \t\u{a0}\u{2007}\u{202f}\u{3000}\n ', 'req_NFC00006');

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(rag.llamadas()).toBe(0);
  });
});
