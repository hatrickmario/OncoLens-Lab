import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import respuestaConEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import {
  iniciarEscenarioDeCorrecciones,
  montarCorrecciones,
  registrarKi67,
  type EscenarioDeCorrecciones,
} from '../../support/correcciones.js';
import { insertarFxT1aA } from '../../support/filas-sinteticas.js';
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  ragSimulado,
} from '../../support/gateway.js';
import {
  instantaneaDeTablas,
  tablasConDiferencia,
  type InstantaneaDeTablas,
} from '../../support/instantanea-de-tablas.js';
import { montarRegistroManual } from '../../support/registro-manual.js';
import {
  PREGUNTA_DE_SEGUIMIENTO,
  crearAnalisisConEvidencia,
  respuestaDeSeguimientoCitando,
  rutaDeSeguimiento,
} from '../../support/seguimiento.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9980;
const SCHEMAS = { schemas: ['clinical', 'identity'] } as const;
const TABLA_DEL_ANALISIS = 'clinical.ai_analysis_record';
const TABLA_DEL_SEGUIMIENTO = 'clinical.analysis_follow_up';
/** Las siete tablas clínicas de US-070 AC-1. */
const TABLAS_CLINICAS = [
  'clinical.patient',
  'clinical.diagnosis',
  'clinical.biomarker',
  'clinical.treatment',
  'clinical.clinical_event',
  'clinical.prior_treatment',
  'clinical.clinical_attribute',
] as const;

const rag = ragSimulado();
let escenario: EscenarioDeCorrecciones;
const patientId = idDePaciente('a');

beforeAll(async () => {
  rag.iniciar();
  escenario = await iniciarEscenarioDeCorrecciones('gw_sin_escrituras', ESPACIO_DE_IDS);
  // FX-T1a-a: datos `requiere_revision`, `rechazado` y `reemplazado` que el análisis no debe tocar (RN-07, RN-08).
  await insertarFxT1aA(escenario.mundo.cliente, escenario.mundo.ids, patientId);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await escenario.cerrar();
});

const instantanea = (): Promise<InstantaneaDeTablas> =>
  instantaneaDeTablas(escenario.mundo.cliente, SCHEMAS);

async function pedirAnalisis(traceId: string) {
  const { app } = await montarGateway(escenario.mundo, {
    traceIds: { traceId: () => traceId },
  });
  return clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', escenario.cookieDoctor)
    .send({ patientId, query: PREGUNTA_Q_HER2, sourcesSelected: TODAS_LAS_FUENTES });
}

/** Filas manuales creadas por los endpoints del doctor: registro de Ki-67, su corrección y un diagnóstico corregido. */
async function sembrarFilasManuales(): Promise<{ origenId: string; sucesoraId: string }> {
  const origenId = await registrarKi67(escenario, patientId);
  const correccion = await clienteVerificado(montarCorrecciones(escenario.mundo).app)
    .post(`/platform/patients/${patientId}/biomarkers/${origenId}/corrections`)
    .set('Cookie', escenario.cookieDoctor)
    .send({ value: '25', unit: '%' });
  if (correccion.status !== 201) throw new Error('no se pudo corregir el biomarcador sintético');
  const sucesoraId = correccion.body.id as string;
  const diagnostico = await clienteVerificado(montarRegistroManual(escenario.mundo).app)
    .post(`/platform/patients/${patientId}/diagnoses`)
    .set('Cookie', escenario.cookieDoctor)
    .send({ grading: { gradingSystem: 'nottingham', nottinghamGrade: 2 } });
  if (diagnostico.status !== 201) throw new Error('no se pudo registrar el diagnóstico sintético');
  return { origenId, sucesoraId };
}

async function estadoDeLaFila(id: string): Promise<{ review_status: string; value: string }> {
  const { rows } = await escenario.mundo.cliente.query<{ review_status: string; value: string }>(
    'SELECT review_status::text, value FROM clinical.biomarker WHERE id = $1',
    [id],
  );
  return rows[0] as { review_status: string; value: string };
}

describe('el análisis no escribe datos clínicos (AC-T3.2)', () => {
  it('no cambia el número de filas ni el contenido de las siete tablas clínicas cuando se completa un análisis con_evidencia [US-070 AC-1]', async () => {
    const antes = await instantanea();

    const respuesta = await pedirAnalisis('req_SinEscr0001');
    const despues = await instantanea();

    expect(respuesta.status).toBe(200);
    for (const tabla of TABLAS_CLINICAS) {
      expect(despues[tabla], tabla).toEqual(antes[tabla]);
    }
  });

  it('la única tabla con diferencia en clinical e identity es ai_analysis_record con una fila más cuando se completa un análisis [US-070 AC-2]', async () => {
    const antes = await instantanea();

    const respuesta = await pedirAnalisis('req_SinEscr0002');
    const despues = await instantanea();

    expect(respuesta.status).toBe(200);
    expect(tablasConDiferencia(antes, despues)).toEqual([TABLA_DEL_ANALISIS]);
    expect(despues[TABLA_DEL_ANALISIS]?.filas).toBe((antes[TABLA_DEL_ANALISIS]?.filas ?? 0) + 1);
    const fila = await leerRegistroPorTrace(escenario.mundo.cliente, 'req_SinEscr0002');
    expect(fila?.id).toBe(respuesta.body.id);
    expect(respuesta.body.traceId).toBe('req_SinEscr0002');
  });

  it('las filas registradas y corregidas a mano no cambian y la única diferencia es ai_analysis_record cuando se analiza [US-070 AC-2] [RN-08]', async () => {
    const { origenId, sucesoraId } = await sembrarFilasManuales();
    const origenAntes = await estadoDeLaFila(origenId);
    const sucesoraAntes = await estadoDeLaFila(sucesoraId);
    const antes = await instantanea();

    const respuesta = await pedirAnalisis('req_SinEscr0003');
    const despues = await instantanea();

    expect(respuesta.status).toBe(200);
    expect(tablasConDiferencia(antes, despues)).toEqual([TABLA_DEL_ANALISIS]);
    expect(origenAntes.review_status).toBe('reemplazado');
    expect(await estadoDeLaFila(origenId)).toEqual(origenAntes);
    expect(sucesoraAntes.review_status).toBe('verificado');
    expect(await estadoDeLaFila(sucesoraId)).toEqual(sucesoraAntes);
  });
});

describe('la pregunta de seguimiento no escribe datos clínicos (AC-T3.2)', () => {
  it('la única tabla con diferencia es analysis_follow_up y la fila del análisis no cambia cuando se completa una pregunta de seguimiento [US-070 AC-2]', async () => {
    const { app } = await montarGateway(escenario.mundo, {
      traceIds: { traceId: () => 'req_SinEscr0004' },
      analysisMaxOptions: 3,
    });
    const analisis = await crearAnalisisConEvidencia(app, escenario.cookieDoctor, rag, patientId);
    rag.reiniciar();
    rag.seguimiento.responder({
      tipo: 'json',
      status: 200,
      cuerpo: respuestaDeSeguimientoCitando(['ch-a1-1', 'ch-a5-1']),
    });
    const antes = await instantanea();

    const respuesta = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', escenario.cookieDoctor)
      .send({ question: PREGUNTA_DE_SEGUIMIENTO });
    const despues = await instantanea();

    expect(respuesta.status).toBe(201);
    expect(tablasConDiferencia(antes, despues)).toEqual([TABLA_DEL_SEGUIMIENTO]);
    expect(despues[TABLA_DEL_SEGUIMIENTO]?.filas).toBe(
      (antes[TABLA_DEL_SEGUIMIENTO]?.filas ?? 0) + 1,
    );
    const { rows } = await escenario.mundo.cliente.query<{ id: string }>(
      'SELECT id FROM clinical.analysis_follow_up WHERE analysis_id = $1',
      [analisis.id],
    );
    expect(rows.map((fila) => fila.id)).toEqual([respuesta.body.id]);
  });
});

describe('una respuesta interna con campos inesperados no persiste nada (AC-T3.2)', () => {
  it('responde 502 ERROR_SERVICIO_IA sin actions y ninguna tabla cambia cuando la respuesta interna trae un campo actions [US-070 AC-4]', async () => {
    rag.responder({
      tipo: 'json',
      status: 200,
      cuerpo: {
        ...structuredClone(respuestaConEvidencia),
        actions: [{ type: 'registrar_tratamiento' }],
      },
    });
    const antes = await instantanea();

    const respuesta = await pedirAnalisis('req_SinEscr0005');
    const despues = await instantanea();

    expect(respuesta.status).toBe(502);
    expect(respuesta.body.error).toBe('ERROR_SERVICIO_IA');
    const texto = JSON.stringify(respuesta.body);
    expect(texto).not.toContain('actions');
    expect(texto).not.toContain('registrar_tratamiento');
    expect(tablasConDiferencia(antes, despues)).toEqual([]);
  });
});
