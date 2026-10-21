import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearLectorDeIdentidad } from '../../../src/modules/evidence-analysis/deidentification/patient-identity.reader.js';
import {
  PUNTERO_503,
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  abrirSesion,
  contarRegistrosPorTrace,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { FX_T4A_A, servicioDeIdentidad } from '../../support/identidad.js';

const ESPACIO_DE_IDS = 15;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-integridad-analisis-0001';
const TRACE_ID = 'req_IntegridadA01';

describe('Identidad alterada en el camino real del análisis', () => {
  const rag = ragSimulado();
  let mundo: MundoDeGateway;
  let cookie: string;

  beforeAll(async () => {
    rag.iniciar();
    mundo = await prepararMundoConSeed('identidad_integridad_analisis', ESPACIO_DE_IDS);
    cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  });
  afterEach(() => rag.reiniciar());
  afterAll(async () => {
    rag.detener();
    await mundo.cerrar();
  });

  it('falla cerrado con 503 DESIDENTIFICACION_NO_DISPONIBLE, sin llamar a rag-orchestrator ni persistir y sin datos del paciente cuando un byte del cifrado fue alterado [US-046 AC-3]', async () => {
    const identidad = servicioDeIdentidad(mundo.cliente);
    const patientId = await crearPacienteFxT4aA(mundo, identidad);
    await mundo.cliente.query(
      `UPDATE identity.patient_identity
          SET national_id_ciphertext = set_byte(national_id_ciphertext, 14, get_byte(national_id_ciphertext, 14) # 1)
        WHERE patient_id = $1`,
      [patientId],
    );
    const { app, logger } = await montarGateway(mundo, {
      traceIds: { traceId: () => TRACE_ID },
      identidades: crearLectorDeIdentidad(identidad),
    });

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({ patientId, query: PREGUNTA_Q_HER2, sourcesSelected: TODAS_LAS_FUENTES });

    expect(respuesta.status).toBe(503);
    expect(respuesta.body).toEqual({
      error: 'DESIDENTIFICACION_NO_DISPONIBLE',
      message: 'No fue posible preparar la consulta.',
      traceId: TRACE_ID,
    });
    assertMatchesSpec('clinical-api', PUNTERO_503, respuesta.body);
    expect(rag.llamadas()).toBe(0);
    expect(await contarRegistrosPorTrace(mundo.cliente, TRACE_ID)).toBe(0);
    for (const prohibido of [
      FX_T4A_A.numeroDeDocumento,
      FX_T4A_A.nombre,
      FX_T4A_A.apellido,
      FX_T4A_A.nombreNormalizado,
    ]) {
      expect(respuesta.text, prohibido).not.toContain(prohibido);
      expect(logger.texto(), prohibido).not.toContain(prohibido);
    }
    // El catch del desidentificador descarta la causa: el log lleva solo el evento de fallo, sin bytes ni texto.
    expect(logger.lineas).toContainEqual({
      event: 'desidentificacion.fallo',
      traceId: TRACE_ID,
      patientId,
    });
  });
});
