import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import errorServicioIa from '../../../../../contracts/examples/error-servicio-ia.json' with { type: 'json' };
import ragSeguimiento from '../../../../../contracts/examples/rag-follow-up-response.json' with { type: 'json' };
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
  PREGUNTA_DE_SEGUIMIENTO,
  crearAnalisisConEvidencia,
  leerTurnos,
  rutaDeSeguimiento,
} from '../../support/seguimiento.js';

/**
 * RN-12 en el seguimiento (US-050): un turno de `/rag/follow-up` servido por la nube para un análisis de dato real se
 * descarta sin persistir. La guarda de entorno sintético se omite en el arnés (`[S1 resp. 14d]`, la retira US-143).
 */
const ESPACIO_DE_IDS = 9704;
const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_proveedor_seguimiento', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-proveedor-seguimiento');
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const conLlmProvider = (llmProvider: 'local' | 'nube') => ({
  ...structuredClone(ragSeguimiento),
  meta: { ...structuredClone(ragSeguimiento).meta, llmProvider },
});

async function reclasificarComoReal(analysisId: string): Promise<void> {
  // El análisis es inmutable por trigger: el test lo reclasifica con el trigger apagado, solo en su base.
  await mundo.cliente.query(
    'ALTER TABLE clinical.ai_analysis_record DISABLE TRIGGER ai_analysis_record_inmutable',
  );
  await mundo.cliente.query(
    `UPDATE clinical.ai_analysis_record SET data_classification = 'real_anonimizado' WHERE id = $1`,
    [analysisId],
  );
  await mundo.cliente.query(
    'ALTER TABLE clinical.ai_analysis_record ENABLE TRIGGER ai_analysis_record_inmutable',
  );
}

describe('proveedor del LLM del seguimiento', () => {
  it('responde 502 ERROR_SERVICIO_IA sin turno persistido cuando el seguimiento declara nube para un análisis real [US-050 AC-5]', async () => {
    const { app } = await montarGateway(mundo, {
      analysisMaxOptions: 3,
      omitirGuardaDeEntornoSintetico: true,
      traceIds: { traceId: () => 'req_ProveedorSeg1' },
    });
    const analisis = await crearAnalisisConEvidencia(app, cookie, rag, idDePaciente('a'));
    await reclasificarComoReal(analisis.id);
    rag.reiniciar();
    rag.seguimiento.responder({ tipo: 'json', status: 200, cuerpo: conLlmProvider('nube') });

    const respuesta = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie)
      .send({ question: PREGUNTA_DE_SEGUIMIENTO });

    expect(respuesta.status).toBe(502);
    expect(respuesta.body.error).toBe('ERROR_SERVICIO_IA');
    expect(respuesta.body.message).toBe(errorServicioIa.message);
    expect(await leerTurnos(mundo.cliente, analisis.id)).toEqual([]);
  });

  it('persiste el turno cuando el seguimiento declara local para un análisis real [US-050 AC-5]', async () => {
    const { app } = await montarGateway(mundo, {
      analysisMaxOptions: 3,
      omitirGuardaDeEntornoSintetico: true,
    });
    const analisis = await crearAnalisisConEvidencia(app, cookie, rag, idDePaciente('b'));
    await reclasificarComoReal(analisis.id);
    rag.reiniciar();
    rag.seguimiento.responder({ tipo: 'json', status: 200, cuerpo: conLlmProvider('local') });

    const respuesta = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie)
      .send({ question: PREGUNTA_DE_SEGUIMIENTO });

    expect(respuesta.status).toBe(201);
    expect(await leerTurnos(mundo.cliente, analisis.id)).toHaveLength(1);
  });
});

describe('proveedor desconocido en el seguimiento', () => {
  it('responde 502 sin turno persistido cuando el seguimiento declara un proveedor desconocido [US-050 AC-5]', async () => {
    const { app } = await montarGateway(mundo, {
      analysisMaxOptions: 3,
      omitirGuardaDeEntornoSintetico: true,
    });
    const analisis = await crearAnalisisConEvidencia(app, cookie, rag, idDePaciente('c'));
    await reclasificarComoReal(analisis.id);
    rag.reiniciar();
    rag.seguimiento.responder({
      tipo: 'json',
      status: 200,
      cuerpo: {
        ...structuredClone(ragSeguimiento),
        meta: { ...ragSeguimiento.meta, llmProvider: 'otro' },
      },
    });

    const respuesta = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie)
      .send({ question: PREGUNTA_DE_SEGUIMIENTO });

    expect(respuesta.status).toBe(502);
    expect(await leerTurnos(mundo.cliente, analisis.id)).toEqual([]);
  });
});
