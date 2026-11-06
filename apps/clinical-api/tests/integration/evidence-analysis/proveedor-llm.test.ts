import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import errorServicioIa from '../../../../../contracts/examples/error-servicio-ia.json' with { type: 'json' };
import llmLocalNoDisponible from '../../../../../contracts/examples/error-llm-local-no-disponible.json' with { type: 'json' };
import ragConEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import ragLlmLocal from '../../../../../contracts/examples/rag-llm-local-no-disponible.json' with { type: 'json' };
import {
  PREGUNTA_AC1,
  TODAS_LAS_FUENTES,
  abrirSesion,
  contarRegistrosPorTrace,
  crearPacienteSintetico,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

/**
 * RN-12 en el gateway del análisis (US-050): la clasificación sale del paciente, nunca del body, y una respuesta con
 * `llmProvider = nube` para un dato real se descarta. Los pacientes son de CONTENIDO sintético con `data_origin` real (RN-13);
 * la guarda de entorno sintético (`[S1 resp. 14d]`) se omite en el arnés para llegar a la verificación del proveedor.
 */
const ESPACIO_DE_IDS = 204;
const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_proveedor_llm', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-doctor-proveedor-0001');
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

const conLlmProvider = (llmProvider: 'local' | 'nube') => ({
  ...structuredClone(ragConEvidencia),
  meta: { ...structuredClone(ragConEvidencia).meta, llmProvider },
});

describe('clasificación del request interno', () => {
  it('responde 422 CUERPO_INVALIDO sin invocar a la IA ni registrar cuando el body trae dataClassification [US-050 AC-4]', async () => {
    const { app } = await montarGateway(mundo, { traceIds: { traceId: () => 'req_Proveedor01' } });

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({ ...cuerpoValido(idDePaciente('a')), dataClassification: 'sintetico' });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(rag.llamadas()).toBe(0);
    expect(await contarRegistrosPorTrace(mundo.cliente, 'req_Proveedor01')).toBe(0);
  });

  it('envía a Backend 2 la clasificación real del paciente cuando el paciente es real_identificado [US-050 AC-4]', async () => {
    const { app } = await montarGateway(mundo, { omitirGuardaDeEntornoSintetico: true });
    const patientId = await crearPacienteSintetico(mundo, {
      dataOrigin: 'real_identificado',
      conDiagnostico: true,
    });
    rag.responder({ tipo: 'json', status: 200, cuerpo: conLlmProvider('local') });

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send(cuerpoValido(patientId));

    expect(respuesta.status).toBe(200);
    expect(rag.capturadas[0]!.cuerpo['dataClassification']).toBe('real_identificado');
  });
});

describe('proveedor del LLM de la respuesta', () => {
  it('responde 502 ERROR_SERVICIO_IA sin registro cuando la respuesta declara nube para un paciente real_anonimizado [US-050 AC-5]', async () => {
    const { app } = await montarGateway(mundo, {
      omitirGuardaDeEntornoSintetico: true,
      traceIds: { traceId: () => 'req_Proveedor02' },
    });
    const patientId = await crearPacienteSintetico(mundo, {
      dataOrigin: 'real_anonimizado',
      conDiagnostico: true,
    });
    rag.responder({ tipo: 'json', status: 200, cuerpo: conLlmProvider('nube') });

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send(cuerpoValido(patientId));

    expect(respuesta.status).toBe(502);
    expect(respuesta.body).toEqual({
      error: 'ERROR_SERVICIO_IA',
      message: errorServicioIa.message,
      traceId: 'req_Proveedor02',
    });
    expect(await contarRegistrosPorTrace(mundo.cliente, 'req_Proveedor02')).toBe(0);
  });

  it('propaga 503 LOCAL_LLM_UNAVAILABLE sin detalles ni registro cuando el paciente es real_identificado [US-050 AC-5]', async () => {
    const { app } = await montarGateway(mundo, {
      omitirGuardaDeEntornoSintetico: true,
      traceIds: { traceId: () => 'req_Proveedor03' },
    });
    const patientId = await crearPacienteSintetico(mundo, {
      dataOrigin: 'real_identificado',
      conDiagnostico: true,
    });
    rag.responder({ tipo: 'json', status: 503, cuerpo: ragLlmLocal });

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send(cuerpoValido(patientId));

    expect(respuesta.status).toBe(503);
    expect(respuesta.body).toEqual({
      error: 'LOCAL_LLM_UNAVAILABLE',
      message: llmLocalNoDisponible.message,
      traceId: 'req_Proveedor03',
    });
    expect(await contarRegistrosPorTrace(mundo.cliente, 'req_Proveedor03')).toBe(0);
  });
});
