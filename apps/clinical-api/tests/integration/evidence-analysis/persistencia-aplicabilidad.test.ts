import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ragAplicabilidad from '../../../../../contracts/examples/rag-query-aplicabilidad-a-m1.json' with { type: 'json' };
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

const ESPACIO_DE_IDS = 9430;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-aplicabilidad-0001';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_aplicabilidad', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const gateway = (traceId: string) => montarGateway(mundo, { traceIds: { traceId: () => traceId } });

describe('la aplicabilidad persistida es la que responde (RN-06)', () => {
  it('persiste en el AIAnalysisRecord la misma applicability que responde, con causas, avisos y conteo [US-124 AC-7]', async () => {
    rag.responder({ tipo: 'json', status: 200, cuerpo: ragAplicabilidad });
    const { app } = await gateway('req_Aplicab0001');

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({
        patientId: idDePaciente('a'),
        query: PREGUNTA_Q_HER2,
        sourcesSelected: TODAS_LAS_FUENTES,
      });

    expect(respuesta.status).toBe(200);
    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_Aplicab0001');
    expect(fila).toBeDefined();
    expect(fila!['applicability']).toEqual(respuesta.body.applicability);
    expect(respuesta.body.applicability).toEqual(ragAplicabilidad.applicability);
    const [fuente] = respuesta.body.applicability;
    const criterios = Object.fromEntries(
      fuente.criteria.map((c: { criterion: string }) => [c.criterion, c]),
    );
    expect(criterios['estado_menopausico']).toMatchObject({
      status: 'desconocido',
      unknownReason: 'falta_en_paciente',
      patientValue: null,
      patientDataWarning: 'faltante',
    });
    expect(criterios['ecog']).toMatchObject({
      status: 'coincide',
      patientDataWarning: 'sin_verificar',
    });
    expect(fuente.summary).toEqual({ coincide: 2, parcial: 0, noCoincide: 0, desconocido: 4 });
    expect(fuente.populationNotComparable).toBe(false);
  });
});
