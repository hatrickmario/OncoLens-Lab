import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ragTresOpciones from '../../../../../contracts/examples/rag-query-tres-opciones.json' with { type: 'json' };
import ragTresNoComparable from '../../../../../contracts/examples/rag-query-tres-opciones-no-comparable.json' with { type: 'json' };
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
const TOKEN_DE_SESION = 'SINT-cookie-sesion-tres-opciones-0001';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_tres_opciones', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const gateway = (traceId: string) =>
  montarGateway(mundo, { traceIds: { traceId: () => traceId }, analysisMaxOptions: 3 });

const nombres = (opciones: { option: string }[]) => opciones.map((o) => o.option);

async function analizar(traceId: string, cuerpo: unknown) {
  rag.responder({ tipo: 'json', status: 200, cuerpo });
  const { app } = await gateway(traceId);
  return clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({
      patientId: idDePaciente('a'),
      query: PREGUNTA_Q_HER2,
      sourcesSelected: TODAS_LAS_FUENTES,
    });
}

describe('hasta tres opciones ordenadas por aplicabilidad (US-134)', () => {
  it('responde las opciones en el orden de Backend 2 y analysisBasis.maxOptions = 3 [US-134 AC-1]', async () => {
    const respuesta = await analizar('req_TresOpc00001', ragTresOpciones);

    expect(respuesta.status).toBe(200);
    expect(nombres(respuesta.body.evidenceOptions)).toEqual(
      nombres(ragTresOpciones.evidenceOptions),
    );
    expect(respuesta.body.evidenceOptions).toHaveLength(3);
    expect(respuesta.body.analysisBasis.maxOptions).toBe(3);
    expect((rag.capturadas[0]!.cuerpo as { maxOptions: number }).maxOptions).toBe(3);
  });

  it('persiste optionsNotShown igual en la Base del análisis y en el registro [US-134 AC-3]', async () => {
    const respuesta = await analizar('req_TresOpc00002', ragTresOpciones);

    expect(respuesta.body.analysisBasis.optionsNotShown).toBe(1);
    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_TresOpc00002');
    expect(fila).toBeDefined();
    expect(fila!['analysis_basis']).toEqual(respuesta.body.analysisBasis);
    expect((fila!['analysis_basis'] as { optionsNotShown: number }).optionsNotShown).toBe(1);
  });

  it('propaga la opción de población no comparable última y visible [US-134 AC-4]', async () => {
    const respuesta = await analizar('req_TresOpc00003', ragTresNoComparable);

    const ultima = respuesta.body.evidenceOptions.at(-1);
    expect(ultima.populationNotComparable).toBe(true);
    expect(ultima.warnings).toContain('poblacion_no_comparable');
    expect(respuesta.body.analysisBasis.optionsNotShown).toBe(0);
  });

  it('persiste evidence_options en el mismo orden sin reordenar [US-134 AC-8]', async () => {
    const respuesta = await analizar('req_TresOpc00004', ragTresOpciones);

    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_TresOpc00004');
    const persistidas = fila!['evidence_options'] as { option: string }[];
    expect(nombres(persistidas)).toEqual(nombres(ragTresOpciones.evidenceOptions));
    expect(nombres(respuesta.body.evidenceOptions)).toEqual(nombres(persistidas));
  });
});
