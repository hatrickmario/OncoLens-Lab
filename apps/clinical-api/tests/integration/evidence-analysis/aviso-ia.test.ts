import { readFileSync } from 'node:fs';
import path from 'node:path';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DISCLAIMER_DE_TEST,
  PREGUNTA_Q_HER2,
  PREGUNTA_Q_SIN,
  SIN_EVIDENCIA,
  TODAS_LAS_FUENTES,
  abrirSesion,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 401;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-aviso-ia-0001';
const RAIZ_DE_EJEMPLOS = path.resolve(__dirname, '../../../../../contracts/examples');

/** El literal validado (PRD E-11, S1 resp. 32) tal como lo fija el ejemplo del contrato. */
const avisoDelContrato = (ejemplo: string): string =>
  (JSON.parse(readFileSync(path.join(RAIZ_DE_EJEMPLOS, ejemplo), 'utf8')) as { disclaimer: string })
    .disclaimer;

const AVISO_SINTETICO_DE_CONFIGURACION = 'Aviso sintético alterno de configuración.';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_aviso_ia', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

async function solicitar(app: Awaited<ReturnType<typeof montarGateway>>['app'], query: string) {
  return clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({ patientId: idDePaciente('a'), query, sourcesSelected: TODAS_LAS_FUENTES });
}

describe('aviso de IA del análisis (RN-19)', () => {
  it('devuelve disclaimer igual al literal validado de AI_DISCLAIMER_TEXT cuando el análisis es con_evidencia [US-069 AC-1]', async () => {
    const { app } = await montarGateway(mundo, { traceIds: { traceId: () => 'req_AvisoIa0001' } });

    const respuesta = await solicitar(app, PREGUNTA_Q_HER2);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.status).toBe('con_evidencia');
    expect(respuesta.body.disclaimer).toBe(DISCLAIMER_DE_TEST);
    expect(respuesta.body.disclaimer).toBe(avisoDelContrato('con-evidencia-s1.json'));
  });

  it('devuelve el mismo disclaimer cuando el análisis es sin_evidencia [US-069 AC-4]', async () => {
    rag.responder(SIN_EVIDENCIA);
    const { app } = await montarGateway(mundo, { traceIds: { traceId: () => 'req_AvisoIa0002' } });

    const respuesta = await solicitar(app, PREGUNTA_Q_SIN);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.status).toBe('sin_evidencia');
    expect(respuesta.body.disclaimer).toBe(DISCLAIMER_DE_TEST);
    expect(respuesta.body.disclaimer).toBe(avisoDelContrato('sin-evidencia.json'));
  });

  it('devuelve el nuevo valor en disclaimer cuando la configuración cambia AI_DISCLAIMER_TEXT [US-069 AC-2]', async () => {
    const { app } = await montarGateway(mundo, {
      traceIds: { traceId: () => 'req_AvisoIa0003' },
      aiDisclaimerText: AVISO_SINTETICO_DE_CONFIGURACION,
    });

    const respuesta = await solicitar(app, PREGUNTA_Q_HER2);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.disclaimer).toBe(AVISO_SINTETICO_DE_CONFIGURACION);
  });
});
