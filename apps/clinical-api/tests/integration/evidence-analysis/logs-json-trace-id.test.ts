import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PII_FX_T4A_A,
  PREGUNTA_AC1,
  TODAS_LAS_FUENTES,
  TRACE_ID_GENERADO,
  abrirSesion,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { loggerJsonEnMemoria } from '../../support/usuarios.js';

const ESPACIO_DE_IDS = 261;
const PACIENTE_DE_LA_DEMO = idDePaciente('b');

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('logs_json', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-logs-json');
});
beforeEach(() => rag.reiniciar());
afterEach(() => {
  rag.reiniciar();
  vi.restoreAllMocks();
});
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

/**
 * Captura todo lo que el proceso escribiría fuera del logger inyectado: Vitest intercepta `console.*` además de
 * `process.stdout/stderr.write`, así que se espían ambos para que nada escape al contrato de "sin PHI".
 */
function espiarSalidaDelProceso(): () => string {
  const escrito: string[] = [];
  const guardar = (...args: unknown[]) => {
    escrito.push(args.map(String).join(' '));
  };
  for (const metodo of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, metodo).mockImplementation(guardar);
  }
  vi.spyOn(process.stdout, 'write').mockImplementation((trozo) => {
    guardar(trozo);
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((trozo) => {
    guardar(trozo);
    return true;
  });
  return () => escrito.join('\n');
}

describe('logs JSON con el traceId generado por clinical-api', () => {
  it('todas las líneas de la request llevan el traceId generado y ninguna contiene t-123 cuando llega X-Trace-Id: t-123 [US-037 AC-4]', async () => {
    const logger = loggerJsonEnMemoria();
    const { app } = await montarGateway(mundo, { logger });

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .set('X-Trace-Id', 't-123')
      .send({
        patientId: PACIENTE_DE_LA_DEMO,
        query: PREGUNTA_AC1,
        sourcesSelected: TODAS_LAS_FUENTES,
      });

    expect(respuesta.status).toBe(200);
    expect(rag.capturadas[0]?.headers.get('x-trace-id')).toBe(TRACE_ID_GENERADO);
    expect(logger.lineas.length).toBeGreaterThan(0);
    for (const linea of logger.lineas) expect(linea['traceId']).toBe(TRACE_ID_GENERADO);
    expect(logger.texto()).not.toContain('t-123');
  });

  it('genera y propaga el traceId sin cabecera: el request a rag-orchestrator lleva X-Trace-Id y todas las líneas ese traceId [US-037 AC-4]', async () => {
    const logger = loggerJsonEnMemoria();
    const { app } = await montarGateway(mundo, { logger });

    await request(app).post('/platform/evidence-analyses').set('Cookie', cookie).send({
      patientId: PACIENTE_DE_LA_DEMO,
      query: PREGUNTA_AC1,
      sourcesSelected: TODAS_LAS_FUENTES,
    });

    expect(rag.capturadas[0]?.headers.get('x-trace-id')).toBe(TRACE_ID_GENERADO);
    expect(logger.lineas.length).toBeGreaterThan(0);
    for (const linea of logger.lineas) expect(linea['traceId']).toBe(TRACE_ID_GENERADO);
  });
});

describe('logs sin identidad, PHI ni cuerpos', () => {
  it('los logs no contienen el documento, el nombre ni el cuerpo cuando un análisis con identidad en la pregunta responde 422 [US-037 AC-5]', async () => {
    const logger = loggerJsonEnMemoria();
    const salidaDelProceso = espiarSalidaDelProceso();
    const { app } = await montarGateway(mundo, { logger });
    const pregunta = `¿Qué opciones describe la evidencia para ${PII_FX_T4A_A.nombre}, cédula ${PII_FX_T4A_A.cedula}?`;

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({ patientId: 'no-es-uuid', query: pregunta, sourcesSelected: TODAS_LAS_FUENTES });

    expect(respuesta.status).toBe(422);
    expect(logger.lineas.length).toBeGreaterThan(0);
    const todo = `${logger.texto()}\n${salidaDelProceso()}`;
    for (const prohibido of [PII_FX_T4A_A.cedula, 'Lucía', 'Rondón', pregunta, 'no-es-uuid']) {
      expect(todo, prohibido).not.toContain(prohibido);
    }
    for (const linea of logger.lineas) expect(linea['traceId']).toBe(TRACE_ID_GENERADO);
  });
});
