import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import {
  PREGUNTA_AC1,
  PUNTERO_401,
  PUNTERO_403,
  PUNTERO_404,
  PUNTERO_422,
  PUNTERO_502,
  TODAS_LAS_FUENTES,
  TRACE_ID_GENERADO,
  abrirSesion,
  contarAnalisisDelPaciente,
  crearPacienteSintetico,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 202;
/** UUID válido que ningún test ni el seed crean. */
const PACIENTE_INEXISTENTE = '00000000-0000-4000-8000-00000000dead';
const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookieDoctor: string;
let cookieAdmin: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_rechazos', ESPACIO_DE_IDS);
  cookieDoctor = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-doctor-rechazos-0001');
  cookieAdmin = await abrirSesion(mundo, 'admin@test.local', 'SINT-cookie-admin-rechazos-0001');
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const cuerpoValido = (patientId: string) => ({
  patientId,
  query: PREGUNTA_AC1,
  sourcesSelected: TODAS_LAS_FUENTES,
});

describe('gateway de análisis: validación del borde', () => {
  it('responde 422 CUERPO_INVALIDO sin llamar a rag-orchestrator cuando la query está vacía, tiene 2001 caracteres o ninguna fuente está en true [US-052 AC-2]', async () => {
    const { app } = await montarGateway(mundo);
    const invalidos = [
      { ...cuerpoValido(idDePaciente('b')), query: '' },
      { ...cuerpoValido(idDePaciente('b')), query: 'a'.repeat(2001) },
      {
        ...cuerpoValido(idDePaciente('b')),
        sourcesSelected: { guias: false, ensayos: false, publicaciones: false },
      },
    ];

    for (const cuerpo of invalidos) {
      const respuesta = await request(app)
        .post('/platform/evidence-analyses')
        .set('Cookie', cookieDoctor)
        .send(cuerpo);

      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
      expect(respuesta.body.traceId).toBe(TRACE_ID_GENERADO);
      assertMatchesSpec('clinical-api', PUNTERO_422, respuesta.body);
    }
    expect(rag.llamadas()).toBe(0);
  });

  it('acepta una query de exactamente 2000 caracteres y llama a rag-orchestrator una vez [US-052 AC-2]', async () => {
    const { app } = await montarGateway(mundo);

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookieDoctor)
      .send({ ...cuerpoValido(idDePaciente('b')), query: 'a'.repeat(2000) });

    expect(respuesta.status).not.toBe(422);
    expect(rag.llamadas()).toBe(1);
  });

  it('responde 422 CUERPO_INVALIDO sin eco del cuerpo cuando el JSON llega malformado', async () => {
    const { app } = await montarGateway(mundo);

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookieDoctor)
      .set('Content-Type', 'application/json')
      .send('{"patientId":');

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    assertMatchesSpec('clinical-api', PUNTERO_422, respuesta.body);
    expect(rag.llamadas()).toBe(0);
  });
});

describe('gateway de análisis: paciente inexistente', () => {
  it('responde 404 NO_ENCONTRADO sin llamar a rag-orchestrator cuando el patientId no existe [US-052 AC-3]', async () => {
    const { app } = await montarGateway(mundo);

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookieDoctor)
      .send(cuerpoValido(PACIENTE_INEXISTENTE));

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error).toBe('NO_ENCONTRADO');
    assertMatchesSpec('clinical-api', PUNTERO_404, respuesta.body);
    expect(rag.llamadas()).toBe(0);
  });
});

describe('gateway de análisis: sesión y rol', () => {
  it('responde 401 antes del controlador y sin llamar a rag-orchestrator cuando no hay cookie de sesión válida [US-052 AC-6]', async () => {
    const { app, logger } = await montarGateway(mundo);

    const sinCookie = await request(app)
      .post('/platform/evidence-analyses')
      .send(cuerpoValido(idDePaciente('b')));
    const cookieInexistente = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', 'oncolens_session=tokenQueNoEstaEnLaBase')
      .send(cuerpoValido(idDePaciente('b')));

    for (const respuesta of [sinCookie, cookieInexistente]) {
      expect(respuesta.status).toBe(401);
      expect(respuesta.body.error).toBe('NO_AUTENTICADO');
      assertMatchesSpec('clinical-api', PUNTERO_401, respuesta.body);
    }
    expect(rag.llamadas()).toBe(0);
    expect(
      logger.lineas.some((linea) => String(linea['event']).startsWith('evidence_analysis')),
    ).toBe(false);
  });

  it('responde 403 PERMISO_DENEGADO sin llamar a rag-orchestrator cuando admin solicita un análisis [US-052 AC-6]', async () => {
    const { app } = await montarGateway(mundo);

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookieAdmin)
      .send(cuerpoValido(idDePaciente('b')));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error).toBe('PERMISO_DENEGADO');
    expect(respuesta.body.traceId).toBe(TRACE_ID_GENERADO);
    assertMatchesSpec('clinical-api', PUNTERO_403, respuesta.body);
    expect(rag.llamadas()).toBe(0);
  });

  it('responde 403 y no 422 cuando admin envía además un cuerpo inválido, porque el rol se exige antes del cuerpo [US-052 AC-6]', async () => {
    const { app } = await montarGateway(mundo);

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookieAdmin)
      .send({ patientId: 'no-es-un-uuid' });

    expect(respuesta.status).toBe(403);
    expect(rag.llamadas()).toBe(0);
  });
});

describe('gateway de análisis: el desidentificador provisional falla cerrado', () => {
  it('responde 502 sin llamar a rag-orchestrator cuando el paciente tiene data_origin real_anonimizado [S1 resp. 14d]', async () => {
    const { app, logger } = await montarGateway(mundo);
    const patientId = await crearPacienteSintetico(mundo, {
      dataOrigin: 'real_anonimizado',
      conDiagnostico: true,
    });

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookieDoctor)
      .send(cuerpoValido(patientId));

    expect(respuesta.status).toBe(502);
    expect(respuesta.body.error).toBe('ERROR_SERVICIO_IA');
    assertMatchesSpec('clinical-api', PUNTERO_502, respuesta.body);
    expect(rag.llamadas()).toBe(0);
    expect(logger.lineas).toContainEqual(
      expect.objectContaining({ motivo: 'data_origin', traceId: TRACE_ID_GENERADO }),
    );
    expect(logger.texto()).not.toContain(PREGUNTA_AC1);
  });

  it.each([
    ['piloto', { appEnv: 'piloto' }],
    ['ausente', { appEnv: undefined }],
  ])(
    'responde 502 sin llamar a rag-orchestrator cuando APP_ENV es %s [S1 resp. 14d]',
    async (_caso, opciones) => {
      const { app, logger } = await montarGateway(mundo, opciones);

      const respuesta = await request(app)
        .post('/platform/evidence-analyses')
        .set('Cookie', cookieDoctor)
        .send(cuerpoValido(idDePaciente('b')));

      expect(respuesta.status).toBe(502);
      expect(respuesta.body.error).toBe('ERROR_SERVICIO_IA');
      assertMatchesSpec('clinical-api', PUNTERO_502, respuesta.body);
      expect(rag.llamadas()).toBe(0);
      expect(logger.lineas).toContainEqual(expect.objectContaining({ motivo: 'app_env' }));
    },
  );
});

describe('gateway de análisis: caso sin tipo de cáncer', () => {
  it('responde 422 TIPO_CANCER_NO_REGISTRADO sin llamar a rag-orchestrator ni persistir análisis cuando el paciente no tiene diagnóstico activo [S1 resp. 35]', async () => {
    const { app } = await montarGateway(mundo);
    const patientId = await crearPacienteSintetico(mundo, { conDiagnostico: false });
    const antes = await contarAnalisisDelPaciente(mundo.cliente, patientId);

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookieDoctor)
      .send(cuerpoValido(patientId));

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toEqual({
      error: 'TIPO_CANCER_NO_REGISTRADO',
      message:
        'Análisis no realizado: falta el tipo de cáncer; no fue posible filtrar la evidencia.',
      traceId: TRACE_ID_GENERADO,
    });
    assertMatchesSpec('clinical-api', PUNTERO_422, respuesta.body);
    expect(rag.llamadas()).toBe(0);
    expect(await contarAnalisisDelPaciente(mundo.cliente, patientId)).toBe(antes);
  });
});
