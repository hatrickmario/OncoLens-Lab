import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PREGUNTA_DE_CASO, rutaDeTurnos } from '../../support/conversacion.js';
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  abrirSesion,
  contarAnalisisDelPaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type GatewayDeTest,
  type MundoDeGateway,
} from '../../support/gateway.js';
import {
  INSTANTE_ANTERIOR,
  INSTANTE_POSTERIOR,
  LECTOR_DE_IDENTIDAD_UNICA,
  MOTIVO_DE_LA_MARCA,
  REFERENCIA_EXTERNA_DE_LA_MARCA,
  contarRegistrosDeIA,
  crearCasoConIA,
  dejarSinConvenio,
  registrarMarca,
} from '../../support/opt-out.js';
import { PREGUNTA_DE_SEGUIMIENTO, rutaDeSeguimiento } from '../../support/seguimiento.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 8130;
const TOKEN_DOCTOR = 'SINT-cookie-sesion-opt-out-generacion-doc-0001';
const TOKEN_ADMIN = 'SINT-cookie-sesion-opt-out-generacion-adm-0001';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookieDoctor: string;
let cookieAdmin: string;
let gateway: GatewayDeTest;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('opt_out_generacion', ESPACIO_DE_IDS);
  cookieDoctor = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DOCTOR);
  cookieAdmin = await abrirSesion(mundo, 'admin@test.local', TOKEN_ADMIN);
  gateway = await montarGateway(mundo, {
    analysisMaxOptions: 3,
    identidades: LECTOR_DE_IDENTIDAD_UNICA,
  });
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const solicitarAnalisis = (cookie: string, patientId: string) =>
  clienteVerificado(gateway.app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({ patientId, query: PREGUNTA_Q_HER2, sourcesSelected: TODAS_LAS_FUENTES });

const llamadasAIA = () => rag.llamadas() + rag.seguimiento.llamadas() + rag.chat.llamadas();

describe('guardia de opt-out de analisis_ia sobre toda generación con IA (RN-15)', () => {
  it('responde 403 OPT_OUT_ANALISIS_IA sin llamar a rag-orchestrator ni crear registros cuando el paciente tiene opt-out, en análisis, seguimiento y turno [US-148 AC-1]', async () => {
    const caso = await crearCasoConIA(mundo, gateway.app, cookieDoctor, rag);
    await registrarMarca(mundo, caso.patientId, { accion: 'registrado' });
    const antes = await contarRegistrosDeIA(mundo.cliente);

    const analisis = await solicitarAnalisis(cookieDoctor, caso.patientId);
    const seguimiento = await clienteVerificado(gateway.app)
      .post(rutaDeSeguimiento(caso.analysisId))
      .set('Cookie', cookieDoctor)
      .send({ question: PREGUNTA_DE_SEGUIMIENTO });
    const turno = await clienteVerificado(gateway.app)
      .post(rutaDeTurnos(caso.conversationId))
      .set('Cookie', cookieDoctor)
      .send({ question: PREGUNTA_DE_CASO });

    for (const respuesta of [analisis, seguimiento, turno]) {
      expect(respuesta.status).toBe(403);
      expect(respuesta.body).toEqual({
        error: 'OPT_OUT_ANALISIS_IA',
        message: expect.any(String),
        traceId: expect.any(String),
      });
      expect(JSON.stringify(respuesta.body)).not.toContain(REFERENCIA_EXTERNA_DE_LA_MARCA);
      expect(JSON.stringify(respuesta.body)).not.toContain(MOTIVO_DE_LA_MARCA);
    }
    expect(llamadasAIA()).toBe(0);
    expect(await contarRegistrosDeIA(mundo.cliente)).toEqual(antes);
    expect(gateway.logger.texto()).not.toContain(REFERENCIA_EXTERNA_DE_LA_MARCA);
    expect(gateway.logger.texto()).not.toContain(MOTIVO_DE_LA_MARCA);
  });

  it('responde PERMISO_DENEGADO antes de leer la marca y sin llamar a rag-orchestrator cuando el rol es admin, en análisis, seguimiento y turno [US-148 AC-1] [E-04]', async () => {
    const caso = await crearCasoConIA(mundo, gateway.app, cookieDoctor, rag);
    await registrarMarca(mundo, caso.patientId, { accion: 'registrado' });

    const analisis = await solicitarAnalisis(cookieAdmin, caso.patientId);
    const seguimiento = await clienteVerificado(gateway.app)
      .post(rutaDeSeguimiento(caso.analysisId))
      .set('Cookie', cookieAdmin)
      .send({ question: PREGUNTA_DE_SEGUIMIENTO });
    const turno = await clienteVerificado(gateway.app)
      .post(rutaDeTurnos(caso.conversationId))
      .set('Cookie', cookieAdmin)
      .send({ question: PREGUNTA_DE_CASO });

    for (const respuesta of [analisis, seguimiento, turno]) {
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error).toBe('PERMISO_DENEGADO');
    }
    expect(llamadasAIA()).toBe(0);
  });

  it('responde 500 sin llamar a la IA ni crear registros cuando falla la lectura de patient_opt_out [US-148 AC-1] (falla cerrada)', async () => {
    const caso = await crearCasoConIA(mundo, gateway.app, cookieDoctor, rag);
    const antes = await contarRegistrosDeIA(mundo.cliente);
    await mundo.cliente.query(
      'ALTER TABLE clinical.patient_opt_out RENAME TO patient_opt_out_caida',
    );
    let analisis, seguimiento, turno;
    try {
      analisis = await solicitarAnalisis(cookieDoctor, caso.patientId);
      seguimiento = await clienteVerificado(gateway.app)
        .post(rutaDeSeguimiento(caso.analysisId))
        .set('Cookie', cookieDoctor)
        .send({ question: PREGUNTA_DE_SEGUIMIENTO });
      turno = await clienteVerificado(gateway.app)
        .post(rutaDeTurnos(caso.conversationId))
        .set('Cookie', cookieDoctor)
        .send({ question: PREGUNTA_DE_CASO });
    } finally {
      await mundo.cliente.query(
        'ALTER TABLE clinical.patient_opt_out_caida RENAME TO patient_opt_out',
      );
    }

    for (const respuesta of [analisis, seguimiento, turno]) {
      expect(respuesta?.status).toBe(500);
      expect(respuesta?.body.error).toBe('ERROR_INTERNO');
    }
    expect(llamadasAIA()).toBe(0);
    expect(await contarRegistrosDeIA(mundo.cliente)).toEqual(antes);
  });

  it('responde 404 y no 403 cuando el paciente, el análisis o la conversación no existen [US-148 AC-1]', async () => {
    const inexistente = '00000000-0000-4000-8000-0000000000bb';

    const analisis = await solicitarAnalisis(cookieDoctor, inexistente);
    const seguimiento = await clienteVerificado(gateway.app)
      .post(rutaDeSeguimiento(inexistente))
      .set('Cookie', cookieDoctor)
      .send({ question: PREGUNTA_DE_SEGUIMIENTO });
    const turno = await clienteVerificado(gateway.app)
      .post(rutaDeTurnos(inexistente))
      .set('Cookie', cookieDoctor)
      .send({ question: PREGUNTA_DE_CASO });

    for (const respuesta of [analisis, seguimiento, turno]) {
      expect(respuesta.status).toBe(404);
      expect(respuesta.body.error).toBe('NO_ENCONTRADO');
    }
  });

  it('responde 200 y persiste el AIAnalysisRecord cuando la última marca de analisis_ia está revocada [US-148 AC-4]', async () => {
    const caso = await crearCasoConIA(mundo, gateway.app, cookieDoctor, rag);
    await registrarMarca(mundo, caso.patientId, {
      accion: 'registrado',
      instante: INSTANTE_ANTERIOR,
    });
    await registrarMarca(mundo, caso.patientId, {
      accion: 'revocado',
      instante: INSTANTE_POSTERIOR,
    });
    const antes = await contarAnalisisDelPaciente(mundo.cliente, caso.patientId);

    const respuesta = await solicitarAnalisis(cookieDoctor, caso.patientId);

    expect(respuesta.status).toBe(200);
    expect(await contarAnalisisDelPaciente(mundo.cliente, caso.patientId)).toBe(antes + 1);
  });

  it('responde 200 cuando el paciente solo tiene un opt-out de investigacion [US-148 AC-5]', async () => {
    const caso = await crearCasoConIA(mundo, gateway.app, cookieDoctor, rag);
    await registrarMarca(mundo, caso.patientId, { tipo: 'investigacion', accion: 'registrado' });

    const respuesta = await solicitarAnalisis(cookieDoctor, caso.patientId);

    expect(respuesta.status).toBe(200);
  });

  it('termina y persiste el análisis en curso y responde 403 al siguiente cuando se registra un opt-out durante la llamada a rag-orchestrator [US-148 AC-6]', async () => {
    const caso = await crearCasoConIA(mundo, gateway.app, cookieDoctor, rag);
    await registrarMarca(mundo, caso.patientId, {
      accion: 'registrado',
      instante: INSTANTE_ANTERIOR,
    });
    await registrarMarca(mundo, caso.patientId, {
      accion: 'revocado',
      instante: INSTANTE_POSTERIOR,
    });
    const antes = await contarAnalisisDelPaciente(mundo.cliente, caso.patientId);
    rag.alRecibirConsulta(() =>
      registrarMarca(mundo, caso.patientId, {
        accion: 'registrado',
        instante: '2026-10-14T09:00:00.000Z',
      }),
    );

    const enCurso = await solicitarAnalisis(cookieDoctor, caso.patientId);
    const siguiente = await solicitarAnalisis(cookieDoctor, caso.patientId);

    expect(enCurso.status).toBe(200);
    expect(await contarAnalisisDelPaciente(mundo.cliente, caso.patientId)).toBe(antes + 1);
    expect(siguiente.status).toBe(403);
    expect(siguiente.body.error).toBe('OPT_OUT_ANALISIS_IA');
  });

  it('responde 403 OPT_OUT_ANALISIS_IA en el análisis, el seguimiento y el turno sin llamar a la IA cuando el paciente real no tiene convenio [US-148 AC-9]', async () => {
    const caso = await crearCasoConIA(mundo, gateway.app, cookieDoctor, rag);
    await dejarSinConvenio(mundo.cliente, caso.patientId, 'real_anonimizado');
    const antes = await contarRegistrosDeIA(mundo.cliente);

    const analisis = await solicitarAnalisis(cookieDoctor, caso.patientId);
    const seguimiento = await clienteVerificado(gateway.app)
      .post(rutaDeSeguimiento(caso.analysisId))
      .set('Cookie', cookieDoctor)
      .send({ question: PREGUNTA_DE_SEGUIMIENTO });
    const turno = await clienteVerificado(gateway.app)
      .post(rutaDeTurnos(caso.conversationId))
      .set('Cookie', cookieDoctor)
      .send({ question: PREGUNTA_DE_CASO });

    for (const respuesta of [analisis, seguimiento, turno]) {
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error).toBe('OPT_OUT_ANALISIS_IA');
    }
    expect(llamadasAIA()).toBe(0);
    expect(await contarRegistrosDeIA(mundo.cliente)).toEqual(antes);
  });

  it('responde 200 cuando el paciente sintético de dataset no tiene convenio [US-148 AC-9]', async () => {
    const caso = await crearCasoConIA(mundo, gateway.app, cookieDoctor, rag);
    await dejarSinConvenio(mundo.cliente, caso.patientId, 'sintetico');

    const respuesta = await solicitarAnalisis(cookieDoctor, caso.patientId);

    expect(respuesta.status).toBe(200);
  });
});
