import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ragSoloDescartadasLenguaje from '../../../../../contracts/examples/rag-query-solo-descartadas-lenguaje.json' with { type: 'json' };
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

const ESPACIO_DE_IDS = 9830;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-lenguaje-0001';
// La pregunta del request de ejemplo del proveedor: la respuesta simulada es la de ese ejemplo.
const PREGUNTA =
  'En mujeres con cáncer de mama HER2 positivo en estadio temprano, ¿qué describe la evidencia sobre la supervivencia libre de enfermedad con terapia anti-HER2 adyuvante?';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_persist_lenguaje', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

describe('motivo lenguaje_no_permitido de una opción descartada (RN-06, RN-23)', () => {
  it('valida con el cliente generado y persiste discardReason lenguaje_no_permitido sin pérdida [US-245 AC-7]', async () => {
    rag.responder({ tipo: 'json', status: 200, cuerpo: ragSoloDescartadasLenguaje });
    const traceId = 'req_Lenguaje0001';
    const { app } = await montarGateway(mundo, { traceIds: { traceId: () => traceId } });

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({
        patientId: idDePaciente('a'),
        query: PREGUNTA,
        sourcesSelected: TODAS_LAS_FUENTES,
      });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.evidenceOptions).toEqual([]);
    const motivos = (respuesta.body.discardedOptions as { discardReason: string }[]).map(
      (d) => d.discardReason,
    );
    expect(motivos).toEqual(['lenguaje_no_permitido', 'lenguaje_no_permitido']);
    const fila = await leerRegistroPorTrace(mundo.cliente, traceId);
    expect(fila).toBeDefined();
    expect(fila!['discarded_options']).toEqual(respuesta.body.discardedOptions);
    expect(fila!['discarded_options']).toEqual(ragSoloDescartadasLenguaje.discardedOptions);
  });
});
