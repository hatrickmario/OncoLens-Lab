import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import { INSTANTE_FIJO, insertar } from '../../support/filas-sinteticas.js';
import {
  PII_FX_T4A_A,
  abrirSesion,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import {
  crearAnalisisConEvidencia,
  leerTurnos,
  rutaDeSeguimiento,
} from '../../support/seguimiento.js';

const ESPACIO_DE_IDS = 9640;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-seguimiento-pii-0001';
const IDENTIDAD = {
  nombreCompleto: PII_FX_T4A_A.nombre,
  documento: PII_FX_T4A_A.cedula,
  telefono: PII_FX_T4A_A.telefono,
};
const PREGUNTA_CON_PII = `¿Qué dice la evidencia sobre la opción 2 para ${PII_FX_T4A_A.nombre}, teléfono ${PII_FX_T4A_A.telefono}?`;
const EVOLUCION_CON_PII = `Control posterior de ${PII_FX_T4A_A.nombre}, CC ${PII_FX_T4A_A.cedula}`;
/** Posterior al instante fijo del análisis (`AHORA` = 2026-10-16): es evolución «desde el análisis». */
const FECHA_DE_LA_EVOLUCION = '2026-10-20';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let patientId: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_seguimiento_pii', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  patientId = await crearPacienteFxT4aA(mundo);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

async function registrarEvolucionPosterior(): Promise<void> {
  const { rows } = await mundo.cliente.query<{ id: string }>(
    'SELECT id FROM clinical.care_episode WHERE patient_id = $1',
    [patientId],
  );
  await insertar(mundo.cliente, 'clinical.clinical_event', {
    id: mundo.ids(),
    patient_id: patientId,
    episode_id: rows[0]!.id,
    event_type: 'evolucion',
    event_date: FECHA_DE_LA_EVOLUCION,
    date_precision: 'dia',
    description: EVOLUCION_CON_PII,
    mapping_status: 'n_a',
    entry_method: 'seed',
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    created_at: INSTANTE_FIJO,
  });
}

describe('pregunta y evolución enmascaradas hacia la IA (RN-11)', () => {
  it('no envía ni registra PII de la pregunta ni de la evolución [US-218 AC-6]', async () => {
    const { app, logger } = await montarGateway(mundo, {
      identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD }),
      analysisMaxOptions: 3,
    });
    const analisis = await crearAnalisisConEvidencia(app, cookie, rag, patientId);
    await registrarEvolucionPosterior();
    rag.reiniciar();
    logger.lineas.length = 0;

    const respuesta = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie)
      .send({ question: PREGUNTA_CON_PII });

    expect(respuesta.status).toBe(201);
    expect(rag.seguimiento.llamadas()).toBe(1);
    const enviado = rag.seguimiento.capturadas[0]!;
    // La evolución viajó (si no, la ausencia de PII no probaría nada) y enmascarada.
    const memoria = (enviado.cuerpo['analysisMemory'] as { outcomesSince: unknown[] }[])[0]!;
    expect(memoria.outcomesSince).toHaveLength(1);
    const prohibidos = [
      PII_FX_T4A_A.nombre,
      'Lucía',
      'Rondón',
      PII_FX_T4A_A.cedula,
      PII_FX_T4A_A.telefono,
    ];
    for (const prohibido of prohibidos) {
      expect(enviado.texto, prohibido).not.toContain(prohibido);
      expect(respuesta.body.question, prohibido).not.toContain(prohibido);
      expect(logger.texto(), prohibido).not.toContain(prohibido);
    }
    const [fila] = await leerTurnos(mundo.cliente, analisis.id);
    expect(fila!.question_text).toBe(respuesta.body.question);
    expect(fila!.question_text).toBe(enviado.cuerpo['question']);
    expect(logger.texto()).not.toContain(PREGUNTA_CON_PII);
  });
});
