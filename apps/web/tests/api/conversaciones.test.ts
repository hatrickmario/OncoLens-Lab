import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import {
  crearManejadorAperturaDeConversacion,
  crearManejadorLecturaDeConversacion,
  crearManejadorTurnoDeConversacion,
} from '../../lib/server/conversaciones';
import {
  crearDependenciasDeTest,
  ejemplo,
  ORIGEN_PERMITIDO,
  URL_CLINICAL_API,
} from '../support/clinical-api-simulado';

const ID_PACIENTE = '3f6d2c1a-8b4e-4a7c-9e5d-6c1b2a3f4e5d';
const ID_CONVERSACION = 'd2a1b3c5-4e6f-4b7a-9d8c-0f1e2d3c4b5a';
const COOKIE = 'otra=x; oncolens_session=sesion-sintetica-1';
const URL_APERTURA = `${URL_CLINICAL_API}/platform/patients/${ID_PACIENTE}/conversations`;
const URL_LECTURA = `${URL_CLINICAL_API}/platform/conversations/${ID_CONVERSACION}`;
const URL_TURNOS = `${URL_LECTURA}/turns`;

interface Recibida {
  cabeceras: Record<string, string>;
  cuerpo: string;
}

const servidor = setupServer();
const recibidas: Recibida[] = [];

async function capturar(request: Request): Promise<void> {
  recibidas.push({
    cabeceras: Object.fromEntries(request.headers.entries()),
    cuerpo: await request.text(),
  });
}

beforeAll(() => servidor.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  servidor.resetHandlers();
  recibidas.length = 0;
});
afterAll(() => servidor.close());

function enviar(url: string, cabeceras: Record<string, string>, cuerpo?: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    ...(cuerpo !== undefined && { body: JSON.stringify(cuerpo) }),
  });
}

const autenticada = { Origin: ORIGEN_PERMITIDO, Cookie: COOKIE };

describe('POST /api/conversations/{conversationId}/turns', () => {
  it('retransmite el turno 201 con el cuerpo idéntico y solo la cookie de sesión cuando el doctor pregunta [US-258 AC-2]', async () => {
    servidor.use(
      http.post(URL_TURNOS, async ({ request }) => {
        await capturar(request);
        return HttpResponse.json(ejemplo('conversation-turn.json'), {
          status: 201,
          headers: { 'Set-Cookie': 'interna=1', 'X-Trace-Id': 'req_9a3f2c1b' },
        });
      }),
    );
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorTurnoDeConversacion(dependencias)(
      enviar(URL_TURNOS, autenticada, ejemplo('conversation-turn-create.json')),
      ID_CONVERSACION,
    );

    expect(recibidas).toHaveLength(1);
    expect(JSON.parse(recibidas[0]!.cuerpo)).toEqual(ejemplo('conversation-turn-create.json'));
    expect(recibidas[0]!.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    expect(cuerpo).toEqual(ejemplo('conversation-turn.json'));
    assertMatchesSpec('clinical-api', '#/components/schemas/ConversationTurn', cuerpo);
    expect(respuesta.headers.get('set-cookie')).toBeNull();
  });

  it.each([
    [502, 'error-servicio-ia.json'],
    [503, 'error-conversation-turn-503.json'],
    [409, 'error-conversation-turn-409.json'],
  ])(
    'retransmite el %s de clinical-api sin reinterpretarlo [US-258 AC-7]',
    async (status, archivo) => {
      servidor.use(
        http.post(URL_TURNOS, async ({ request }) => {
          await capturar(request);
          return HttpResponse.json(ejemplo(archivo), { status });
        }),
      );
      const { dependencias } = crearDependenciasDeTest();

      const respuesta = await crearManejadorTurnoDeConversacion(dependencias)(
        enviar(URL_TURNOS, autenticada, ejemplo('conversation-turn-create.json')),
        ID_CONVERSACION,
      );

      expect(respuesta.status).toBe(status);
      expect(await respuesta.json()).toEqual(ejemplo(archivo));
    },
  );

  it('rechaza otro origen sin contactar a clinical-api [US-258 AC-8] [SEG-01]', async () => {
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorTurnoDeConversacion(dependencias)(
      enviar(URL_TURNOS, { Origin: 'https://otro-origen.test', Cookie: COOKIE }, {}),
      ID_CONVERSACION,
    );

    expect(respuesta.status).toBe(403);
    expect((await respuesta.json()).error).toBe('PERMISO_DENEGADO');
    expect(recibidas).toHaveLength(0);
  });

  it('responde 404 propio a un id que no es UUID sin contactar a clinical-api [US-258 AC-8]', async () => {
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorTurnoDeConversacion(dependencias)(
      enviar(URL_TURNOS, autenticada, {}),
      'no-es-uuid',
    );

    expect(respuesta.status).toBe(404);
    assertMatchesSpec(
      'clinical-api',
      '#/components/schemas/ErrorNoEncontrado',
      await respuesta.json(),
    );
    expect(recibidas).toHaveLength(0);
  });
});

describe('POST /api/patients/{id}/conversations', () => {
  it('retransmite el 201 de la conversación abierta con solo la cookie de sesión [US-258 AC-1]', async () => {
    servidor.use(
      http.post(URL_APERTURA, async ({ request }) => {
        await capturar(request);
        return HttpResponse.json(ejemplo('conversation-create-response.json'), { status: 201 });
      }),
    );
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorAperturaDeConversacion(dependencias)(
      enviar(URL_APERTURA, autenticada),
      ID_PACIENTE,
    );

    expect(respuesta.status).toBe(201);
    expect(await respuesta.json()).toEqual(ejemplo('conversation-create-response.json'));
    expect(recibidas[0]!.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
  });

  it('rechaza otro origen y un id que no es UUID sin contactar a clinical-api [US-258 AC-8]', async () => {
    const { dependencias } = crearDependenciasDeTest();
    const manejador = crearManejadorAperturaDeConversacion(dependencias);

    const ajeno = await manejador(
      enviar(URL_APERTURA, { Origin: 'https://otro-origen.test', Cookie: COOKIE }),
      ID_PACIENTE,
    );
    const malformado = await manejador(enviar(URL_APERTURA, autenticada), 'no-es-uuid');

    expect(ajeno.status).toBe(403);
    expect(malformado.status).toBe(404);
    expect(recibidas).toHaveLength(0);
  });
});

describe('GET /api/conversations/{conversationId}', () => {
  it('retransmite la conversación con no-store y solo la cookie de sesión [US-258 AC-1]', async () => {
    servidor.use(
      http.get(URL_LECTURA, async ({ request }) => {
        await capturar(request);
        return HttpResponse.json(ejemplo('conversation-get.json'), { status: 200 });
      }),
    );
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorLecturaDeConversacion(dependencias)(
      new Request(URL_LECTURA, { headers: { Cookie: COOKIE } }),
      ID_CONVERSACION,
    );

    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/Conversation', cuerpo);
    expect(cuerpo).toEqual(ejemplo('conversation-get.json'));
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(recibidas[0]!.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
  });

  it('responde 404 propio a un id que no es UUID sin contactar a clinical-api [US-258 AC-8]', async () => {
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorLecturaDeConversacion(dependencias)(
      new Request(URL_LECTURA, { headers: { Cookie: COOKIE } }),
      'no-es-uuid',
    );

    expect(respuesta.status).toBe(404);
    expect(recibidas).toHaveLength(0);
  });
});
