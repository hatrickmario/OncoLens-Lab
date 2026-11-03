import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INSTANTE_FIJO, insertar } from '../../support/filas-sinteticas.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import {
  abrirSesion,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import {
  PREGUNTA_DE_SEGUIMIENTO,
  crearAnalisisConEvidencia,
  rutaDeSeguimiento,
} from '../../support/seguimiento.js';

const ESPACIO_DE_IDS = 9690;

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let patientId: string;
let episodeId: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_seguimiento_evolucion', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-seguimiento-evolucion-0001');
  patientId = await crearPacienteFxT4aA(mundo);
  const { rows } = await mundo.cliente.query<{ id: string }>(
    'SELECT id FROM clinical.care_episode WHERE patient_id = $1',
    [patientId],
  );
  episodeId = rows[0]!.id;
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const evento = (descripcion: string, resto: Record<string, unknown> = {}) =>
  insertar(mundo.cliente, 'clinical.clinical_event', {
    id: mundo.ids(),
    patient_id: patientId,
    episode_id: episodeId,
    event_type: 'evolucion',
    event_date: '2026-10-20',
    date_precision: 'dia',
    description: descripcion,
    mapping_status: 'n_a',
    entry_method: 'seed',
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    created_at: INSTANTE_FIJO,
    ...resto,
  });

describe('la evolución posterior que viaja en la memoria del seguimiento (RN-07)', () => {
  it('incluye solo eventos vigentes del paciente posteriores al análisis, sin rechazados, reemplazados ni ligados a un análisis [US-218 AC-6]', async () => {
    const { app } = await montarGateway(mundo, { analysisMaxOptions: 3 });
    const analisis = await crearAnalisisConEvidencia(app, cookie, rag, patientId);
    rag.reiniciar();
    await evento('Evolución vigente posterior');
    await evento('Evolución rechazada', { review_status: 'rechazado' });
    await evento('Evolución reemplazada', { review_status: 'reemplazado' });
    await evento('Evolución ligada a un análisis', { analysis_id: analisis.id });
    await evento('Evolución anterior al análisis', { event_date: '2026-09-01' });

    const respuesta = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie)
      .send({ question: PREGUNTA_DE_SEGUIMIENTO });

    expect(respuesta.status).toBe(201);
    const [memoria] = rag.seguimiento.capturadas[0]!.cuerpo['analysisMemory'] as {
      outcomesSince: { description: string }[];
    }[];
    expect(memoria!.outcomesSince.map((o) => o.description)).toEqual([
      'Evolución vigente posterior',
    ]);
  });

  it('no incluye un evento posterior con precisión incierta aunque traiga fecha, porque monthsAgo exige un entero [US-093 AC-5]', async () => {
    const { app } = await montarGateway(mundo, { analysisMaxOptions: 3 });
    const analisis = await crearAnalisisConEvidencia(app, cookie, rag, patientId);
    rag.reiniciar();
    await evento('Evolución con fecha confiable');
    await evento('Evolución con fecha incierta', { date_precision: 'incierta' });

    const respuesta = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie)
      .send({ question: PREGUNTA_DE_SEGUIMIENTO });

    expect(respuesta.status).toBe(201);
    const [memoria] = rag.seguimiento.capturadas[0]!.cuerpo['analysisMemory'] as {
      outcomesSince: { description: string }[];
    }[];
    const descripciones = memoria!.outcomesSince.map((o) => o.description);
    expect(descripciones).toContain('Evolución con fecha confiable');
    expect(descripciones).not.toContain('Evolución con fecha incierta');
  });
});
