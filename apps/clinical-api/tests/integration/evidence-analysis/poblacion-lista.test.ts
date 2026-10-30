import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ragLista from '../../../../../contracts/examples/rag-query-poblacion-lista.json' with { type: 'json' };
import ragAntiguo from '../../../../../contracts/examples/rag-query-aplicabilidad-a-m1.json' with { type: 'json' };
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  abrirSesion,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 9440;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-poblacion-lista-0001';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_poblacion_lista', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

type Criterio = Record<string, unknown> & { criterion: string };

const criteriosPorNombre = (applicability: { criteria: Criterio[] }[]) =>
  Object.fromEntries(applicability.flatMap((f) => f.criteria).map((c) => [c.criterion, c]));

async function analizar(cuerpoDeRag: object, traceId: string) {
  rag.responder({ tipo: 'json', status: 200, cuerpo: cuerpoDeRag });
  const { app } = await montarGateway(mundo, { traceIds: { traceId: () => traceId } });
  const respuesta = await clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({ patientId: idDePaciente('a'), query: PREGUNTA_Q_HER2, sourcesSelected: TODAS_LAS_FUENTES });
  const fila = await leerRegistroPorTrace(mundo.cliente, traceId);
  return { respuesta, fila };
}

describe('la población del estudio en lista se valida y se conserva (RN-06)', () => {
  it('valida y conserva studyPopulationValues y partialReason cuando rag-orchestrator responde con la forma de lista [US-241 AC-2]', async () => {
    const { respuesta, fila } = await analizar(ragLista, 'req_PobLista01');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.applicability).toEqual(ragLista.applicability);
    expect(fila).toBeDefined();
    expect(fila!['applicability']).toEqual(respuesta.body.applicability);
    const criterios = criteriosPorNombre(respuesta.body.applicability);
    expect(criterios['estadio']).toMatchObject({
      partialReason: 'inclusiva',
      studyPopulationValues: [
        { value: 'I', chunkId: 'chunk_88231', scope: 'elegibilidad' },
        { value: 'II', chunkId: 'chunk_88231', scope: 'elegibilidad' },
        { value: 'III', chunkId: 'chunk_88231', scope: 'elegibilidad' },
      ],
    });
    expect(criterios['estado_menopausico']).toMatchObject({
      unknownReason: 'falta_en_paciente',
      studyPopulationValues: [{ value: 'posmenopáusica', scope: 'subgrupo' }],
    });
  });

  it('valida y conserva la forma antigua sin studyPopulationValues cuando rag-orchestrator responde con el ejemplo anterior [US-241 AC-2]', async () => {
    const { respuesta, fila } = await analizar(ragAntiguo, 'req_PobAntig01');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.applicability).toEqual(ragAntiguo.applicability);
    expect(fila!['applicability']).toEqual(respuesta.body.applicability);
    for (const c of Object.values(criteriosPorNombre(respuesta.body.applicability))) {
      expect(c).not.toHaveProperty('studyPopulationValues');
    }
  });
});
