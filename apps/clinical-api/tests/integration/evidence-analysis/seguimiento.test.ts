import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ragSeguimientoSinEvidencia from '../../../../../contracts/examples/rag-follow-up-sin-evidencia.json' with { type: 'json' };
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
  respuestaDeSeguimientoCitando,
  rutaDeSeguimiento,
} from '../../support/seguimiento.js';

const ESPACIO_DE_IDS = 9610;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-seguimiento-0001';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_seguimiento', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

async function prepararAnalisis() {
  const { app } = await montarGateway(mundo, {
    traceIds: { traceId: () => 'req_SegAnalisis1' },
    analysisMaxOptions: 3,
  });
  const analisis = await crearAnalisisConEvidencia(app, cookie, rag, idDePaciente('a'));
  rag.reiniciar();
  return { app, analisis };
}

describe('pregunta de seguimiento sobre un análisis (FR-31)', () => {
  it('crea el turno 1 citado y persistido cuando el oncólogo pregunta por la opción 2 [US-218 AC-1]', async () => {
    const { app, analisis } = await prepararAnalisis();
    expect(analisis.evidenceOptions.length).toBeGreaterThanOrEqual(2);
    // ch-a1-1 ya lo citó el análisis; ch-a5-1 es una fuente nueva.
    const respuestaRag = respuestaDeSeguimientoCitando(['ch-a1-1', 'ch-a5-1']);
    rag.seguimiento.responder({ tipo: 'json', status: 200, cuerpo: respuestaRag });

    const respuesta = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie)
      .send({ question: PREGUNTA_DE_SEGUIMIENTO });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.turnNumber).toBe(1);
    expect(respuesta.body.status).toBe('con_evidencia');
    const chunksCitados = respuesta.body.citedSources.map((c: { chunkId: string }) => c.chunkId);
    for (const afirmacion of respuesta.body.answer as {
      citedSources: { chunkId: string }[];
      patientDataRefs: string[];
    }[]) {
      expect(afirmacion.citedSources.length + afirmacion.patientDataRefs.length).toBeGreaterThan(0);
      for (const cita of afirmacion.citedSources) expect(chunksCitados).toContain(cita.chunkId);
    }
    expect(rag.seguimiento.llamadas()).toBe(1);
    const [fila] = await leerTurnos(mundo.cliente, analisis.id);
    expect(fila).toMatchObject({
      id: respuesta.body.id,
      turn_number: 1,
      question_text: respuesta.body.question,
    });
    expect(fila!.cited_sources).toEqual(respuesta.body.citedSources);
    expect(respuesta.body.citedSources).toMatchObject([
      { chunkId: 'ch-a1-1', isNewSource: false },
      { chunkId: 'ch-a5-1', isNewSource: true },
    ]);
    // Cada cita conserva los campos que envió rag-orchestrator, sin transformar (RN-04).
    const { citedSources: enviadas } = respuestaRag as { citedSources: object[] };
    expect(
      respuesta.body.citedSources.map(({ isNewSource, ...resto }: { isNewSource: boolean }) => {
        void isNewSource;
        return resto;
      }),
    ).toEqual(enviadas);
  });

  it('persiste el turno sin_evidencia con respuesta y fuentes vacías cuando rag-orchestrator no encuentra evidencia [US-218 AC-3]', async () => {
    const { app, analisis } = await prepararAnalisis();
    rag.seguimiento.responder({ tipo: 'json', status: 200, cuerpo: ragSeguimientoSinEvidencia });

    const respuesta = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie)
      .send({ question: PREGUNTA_DE_SEGUIMIENTO });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      status: 'sin_evidencia',
      answer: [],
      citedSources: [],
    });
    const [fila] = await leerTurnos(mundo.cliente, analisis.id);
    expect(fila).toMatchObject({ id: respuesta.body.id, status: 'sin_evidencia', turn_number: 1 });
  });
});
