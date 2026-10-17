import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearGeneradorDeToken } from '../../../src/infrastructure/token.js';
import {
  PREGUNTA_AC1,
  PUNTERO_200,
  TODAS_LAS_FUENTES,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { CONTRASENA_FICTICIA_DOCTOR } from '../../support/seed.js';
import { cookiesEmitidas } from '../../support/usuarios.js';

const ESPACIO_DE_IDS = 203;
const rag = ragSimulado();
let mundo: MundoDeGateway;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_sesion', ESPACIO_DE_IDS);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

describe('la sesión del doctor nunca llega a rag-orchestrator', () => {
  it('envía Authorization Bearer y ninguna cabecera Cookie ni el token hacia rag-orchestrator cuando se pide un análisis con la cookie del login [US-211 AC-5]', async () => {
    const { app } = await montarGateway(mundo, { tokens: crearGeneradorDeToken() });
    const login = await request(app)
      .post('/platform/auth/login')
      .send({ email: 'doc1@test.local', password: CONTRASENA_FICTICIA_DOCTOR });
    const parDeLaCookie = cookiesEmitidas(login)[0]?.split(';')[0] ?? '';
    const token = parDeLaCookie.slice(parDeLaCookie.indexOf('=') + 1);
    expect(login.status).toBe(204);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', parDeLaCookie)
      .send({
        patientId: idDePaciente('a'),
        query: PREGUNTA_AC1,
        sourcesSelected: TODAS_LAS_FUENTES,
      });

    // Primero el contador: sin exactamente una llamada capturada, revisar cabeceras no probaría nada.
    expect(rag.llamadas()).toBe(1);
    const { headers, texto } = rag.capturadas[0]!;
    expect(headers.get('authorization') ?? '').toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(headers.has('cookie')).toBe(false);
    for (const [nombre, valor] of headers) {
      expect(`${nombre}: ${valor}`, nombre).not.toContain(token);
    }
    expect(texto).not.toContain(token);
    expect(texto).not.toContain('oncolens_session');
    expect(respuesta.status).toBe(200);
    assertMatchesSpec('clinical-api', PUNTERO_200, respuesta.body);
  });
});
