import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  IDENTIDAD_CHAT,
  PREGUNTA_DE_CASO,
  abrirConversacion,
  rutaDeApertura,
  rutaDeConversacion,
  rutaDeTurnos,
} from '../../support/conversacion.js';
import {
  abrirSesion,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9800;
const TOKEN_DOCTOR = 'SINT-cookie-sesion-conversacion-permisos-doc-0001';
const TOKEN_ADMIN = 'SINT-cookie-sesion-conversacion-permisos-adm-0001';
const UUID_INEXISTENTE = '00000000-0000-4000-8000-0000000000aa';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookieDoctor: string;
let cookieAdmin: string;
let patientId: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_conversacion_permisos', ESPACIO_DE_IDS);
  cookieDoctor = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DOCTOR);
  cookieAdmin = await abrirSesion(mundo, 'admin@test.local', TOKEN_ADMIN);
  patientId = await crearPacienteFxT4aA(mundo);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

async function montar() {
  return montarGateway(mundo, {
    identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
  });
}

describe('Solo el rol doctor conversa y la conversación debe existir (E-04)', () => {
  it('responde 403 PERMISO_DENEGADO a admin en las tres operaciones y no llama a Backend 2 [US-258 AC-8] [E-04]', async () => {
    const { app } = await montar();
    const conversationId = await abrirConversacion(app, cookieDoctor, patientId);
    const cliente = clienteVerificado(app);

    const apertura = await cliente.post(rutaDeApertura(patientId)).set('Cookie', cookieAdmin);
    const turno = await cliente
      .post(rutaDeTurnos(conversationId))
      .set('Cookie', cookieAdmin)
      .send({ question: PREGUNTA_DE_CASO });
    const lectura = await cliente
      .get(rutaDeConversacion(conversationId))
      .set('Cookie', cookieAdmin);

    for (const respuesta of [apertura, turno, lectura]) {
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error).toBe('PERMISO_DENEGADO');
    }
    expect(rag.chat.llamadas()).toBe(0);
  });

  it('responde 401 NO_AUTENTICADO en las tres operaciones cuando no hay sesión [US-258 AC-8]', async () => {
    const { app } = await montar();
    const conversationId = await abrirConversacion(app, cookieDoctor, patientId);
    const cliente = clienteVerificado(app);

    const apertura = await cliente.post(rutaDeApertura(patientId));
    const turno = await cliente
      .post(rutaDeTurnos(conversationId))
      .send({ question: PREGUNTA_DE_CASO });
    const lectura = await cliente.get(rutaDeConversacion(conversationId));

    for (const respuesta of [apertura, turno, lectura]) {
      expect(respuesta.status).toBe(401);
      expect(respuesta.body.error).toBe('NO_AUTENTICADO');
    }
    expect(rag.chat.llamadas()).toBe(0);
  });

  it('responde 404 sin llamar a Backend 2 cuando la conversación o el paciente no existen [US-258 AC-8]', async () => {
    const { app } = await montar();
    const cliente = clienteVerificado(app);

    const turno = await cliente
      .post(rutaDeTurnos(UUID_INEXISTENTE))
      .set('Cookie', cookieDoctor)
      .send({ question: PREGUNTA_DE_CASO });
    const lectura = await cliente
      .get(rutaDeConversacion(UUID_INEXISTENTE))
      .set('Cookie', cookieDoctor);
    const apertura = await cliente
      .post(rutaDeApertura(UUID_INEXISTENTE))
      .set('Cookie', cookieDoctor);

    for (const respuesta of [turno, lectura, apertura]) {
      expect(respuesta.status).toBe(404);
      expect(respuesta.body.error).toBe('NO_ENCONTRADO');
    }
    expect(rag.chat.llamadas()).toBe(0);
  });

  it('responde 422 CUERPO_INVALIDO sin llamar a Backend 2 cuando la pregunta está vacía [US-258 AC-8]', async () => {
    const { app } = await montar();
    const conversationId = await abrirConversacion(app, cookieDoctor, patientId);

    const respuesta = await clienteVerificado(app)
      .post(rutaDeTurnos(conversationId))
      .set('Cookie', cookieDoctor)
      .send({ question: '   ' });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(rag.chat.llamadas()).toBe(0);
  });

  it('responde 422 CUERPO_INVALIDO sin llamar a Backend 2 cuando aboutTurnId no es un turno de la conversación [US-258 AC-8]', async () => {
    const { app } = await montar();
    const conversationId = await abrirConversacion(app, cookieDoctor, patientId);

    const respuesta = await clienteVerificado(app)
      .post(rutaDeTurnos(conversationId))
      .set('Cookie', cookieDoctor)
      .send({ question: PREGUNTA_DE_CASO, aboutTurnId: UUID_INEXISTENTE });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(rag.chat.llamadas()).toBe(0);
  });
});
