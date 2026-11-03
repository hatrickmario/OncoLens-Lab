import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ragLlmNoDisponible from '../../../../../contracts/examples/rag-llm-local-no-disponible.json' with { type: 'json' };
import ragTresOpciones from '../../../../../contracts/examples/rag-query-tres-opciones.json' with { type: 'json' };
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import { INSTANTE_FIJO, insertar } from '../../support/filas-sinteticas.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import {
  PII_FX_T4A_A,
  PREGUNTA_Q_HER2,
  abrirSesion,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { loggerJsonEnMemoria, traceIdsFijos } from '../../support/usuarios.js';
import { crearAnalisisConEvidencia, rutaDeSeguimiento } from '../../support/seguimiento.js';

const ESPACIO_DE_IDS = 9670;
const PREGUNTA_CON_PII = `¿Qué dice la evidencia sobre la opción 2 para ${PII_FX_T4A_A.nombre}, teléfono ${PII_FX_T4A_A.telefono}?`;
const EVOLUCION_CON_PII = `Control posterior de ${PII_FX_T4A_A.nombre}, CC ${PII_FX_T4A_A.cedula}`;

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let patientId: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_seguimiento_logs', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-seguimiento-logs-0001');
  patientId = await crearPacienteFxT4aA(mundo);
  const { rows } = await mundo.cliente.query<{ id: string }>(
    'SELECT id FROM clinical.care_episode WHERE patient_id = $1',
    [patientId],
  );
  await insertar(mundo.cliente, 'clinical.clinical_event', {
    id: mundo.ids(),
    patient_id: patientId,
    episode_id: rows[0]!.id,
    event_type: 'evolucion',
    event_date: '2026-10-20',
    date_precision: 'dia',
    description: EVOLUCION_CON_PII,
    mapping_status: 'n_a',
    entry_method: 'seed',
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    created_at: INSTANTE_FIJO,
  });
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

/** Todo lo que no puede aparecer en una línea de log: la pregunta, la memoria del análisis y la PII sembrada. */
function prohibidosEnLogs(): string[] {
  const opciones = ragTresOpciones.evidenceOptions.map(({ option }) => option);
  const sintesis = ragTresOpciones.synthesis.agreements.map(({ text }) => text);
  return [
    PREGUNTA_CON_PII,
    PREGUNTA_Q_HER2,
    ...opciones,
    ...sintesis,
    EVOLUCION_CON_PII,
    PII_FX_T4A_A.nombre,
    'Lucía',
    'Rondón',
    PII_FX_T4A_A.cedula,
    PII_FX_T4A_A.telefono,
  ];
}

describe('el seguimiento no registra la pregunta, la memoria ni PII en los logs (RN-11)', () => {
  it('no deja en ninguna línea la pregunta, la memoria ni la PII sembrada, y sí el traceId del turno, tanto si responde 201 como si la IA falla [US-218 AC-6]', async () => {
    const logger = loggerJsonEnMemoria();
    const { app } = await montarGateway(mundo, {
      logger,
      traceIds: { traceId: traceIdsFijos() },
      identidades: lectorDeIdentidadFalso({
        [patientId]: {
          nombreCompleto: PII_FX_T4A_A.nombre,
          documento: PII_FX_T4A_A.cedula,
          telefono: PII_FX_T4A_A.telefono,
        },
      }),
      analysisMaxOptions: 3,
    });
    const analisis = await crearAnalisisConEvidencia(app, cookie, rag, patientId);
    rag.reiniciar();
    logger.crudas.length = 0;
    logger.lineas.length = 0;

    const exitoso = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie)
      .send({ question: PREGUNTA_CON_PII });
    rag.seguimiento.responder({ tipo: 'json', status: 503, cuerpo: ragLlmNoDisponible });
    const fallido = await clienteVerificado(app)
      .post(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie)
      .send({ question: PREGUNTA_CON_PII });

    // Sin las dos llamadas salientes el flujo no se ejercitó y la ausencia de texto no probaría nada.
    expect([exitoso.status, fallido.status]).toEqual([201, 503]);
    expect(rag.seguimiento.llamadas()).toBe(2);
    const texto = logger.texto();
    for (const prohibido of prohibidosEnLogs()) expect(texto, prohibido).not.toContain(prohibido);
    expect(texto).toContain('req_00000002'); // el traceId del primer turno (el análisis usó el 1)
    expect(logger.lineas.map((linea) => linea['event'])).toContain('follow_up.solicitud');
  });
});
