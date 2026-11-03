import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  iniciarEscenarioDeCorrecciones,
  montarCorrecciones,
  type EscenarioDeCorrecciones,
} from '../../support/correcciones.js';
import { insertarFxT1aA } from '../../support/filas-sinteticas.js';
import {
  PII_FX_T4A_A,
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  crearPacienteFxT4aA,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  ragSimulado,
} from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9940;

const rag = ragSimulado();
let escenario: EscenarioDeCorrecciones;

beforeAll(async () => {
  rag.iniciar();
  escenario = await iniciarEscenarioDeCorrecciones('corr_analisis', ESPACIO_DE_IDS);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await escenario.cerrar();
});

interface ContextoEnviado {
  biomarkers: { biomarkerName: string; value: string }[];
  clinicalNotes: unknown[];
}

const contextoDe = (indice: number): ContextoEnviado =>
  rag.capturadas[indice]!.cuerpo['clinicalContext'] as ContextoEnviado;

async function analizar(patientId: string, traceId: string, identidad?: Record<string, never>) {
  const { app } = await montarGateway(escenario.mundo, {
    traceIds: { traceId: () => traceId },
    ...(identidad !== undefined && { identidades: lectorDeIdentidadFalso(identidad) }),
  });
  return clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', escenario.cookieDoctor)
    .send({ patientId, query: PREGUNTA_Q_HER2, sourcesSelected: TODAS_LAS_FUENTES });
}

describe('efecto de una corrección sobre el análisis', () => {
  it('cambia la huella del contexto del análisis nuevo y conserva intacto el registro previo tras corregir Ki-67 [US-253 AC-5] [RN-26] [RN-06]', async () => {
    const patientId = idDePaciente('a');
    const { ki67Id } = await insertarFxT1aA(
      escenario.mundo.cliente,
      escenario.mundo.ids,
      patientId,
    );
    const previo = await analizar(patientId, 'req_Huella0001');
    expect(previo.status).toBe(200);
    const registroPrevio = await leerRegistroPorTrace(escenario.mundo.cliente, 'req_Huella0001');
    const ki67Previo = contextoDe(0).biomarkers.find((b) => b.biomarkerName === 'Ki-67');
    expect(ki67Previo?.value).toBe('20 %');

    const correccion = await clienteVerificado(montarCorrecciones(escenario.mundo).app)
      .post(`/platform/patients/${patientId}/biomarkers/${ki67Id}/corrections`)
      .set('Cookie', escenario.cookieDoctor)
      .send({ value: '25', unit: '%' });
    const nuevo = await analizar(patientId, 'req_Huella0002');

    expect(correccion.status).toBe(201);
    expect(nuevo.status).toBe(200);
    const registroNuevo = await leerRegistroPorTrace(escenario.mundo.cliente, 'req_Huella0002');
    expect(registroNuevo?.context_fingerprint).not.toBe(registroPrevio?.context_fingerprint);
    const ki67Nuevo = contextoDe(1).biomarkers.find((b) => b.biomarkerName === 'Ki-67');
    expect(ki67Nuevo?.value).toBe('25');
    expect(rag.capturadas[1]!.texto).not.toContain('20 %');
    const previoDespues = await leerRegistroPorTrace(escenario.mundo.cliente, 'req_Huella0001');
    expect(previoDespues?.context_fingerprint).toBe(registroPrevio?.context_fingerprint);
    expect(previoDespues?.clinical_context_snapshot).toEqual(
      registroPrevio?.clinical_context_snapshot,
    );
  });
});

describe('una nota corregida y la desidentificación (ADR-40, RN-11)', () => {
  const TEXTO_CORREGIDO = `Actualización de la nota corregida: ${PII_FX_T4A_A.textoLibre}`;

  async function corregirNotaConPii(patientId: string) {
    const app = montarCorrecciones(escenario.mundo);
    const { rows } = await escenario.mundo.cliente.query<{ id: string }>(
      "SELECT id FROM clinical.clinical_note WHERE patient_id = $1 AND note_type = 'nota_libre'",
      [patientId],
    );
    const respuesta = await clienteVerificado(app.app)
      .post(`/platform/patients/${patientId}/clinical-notes/${rows[0]!.id}/corrections`)
      .set('Cookie', escenario.cookieDoctor)
      .send({ content: TEXTO_CORREGIDO });
    return { respuesta, logger: app.logger };
  }

  it('no envía a la IA el texto ni la PII de una nota corregida cuando se pide un análisis después [US-253 AC-6] [RN-11]', async () => {
    const patientId = await crearPacienteFxT4aA(escenario.mundo);
    const { respuesta } = await corregirNotaConPii(patientId);

    const analisis = await analizar(patientId, 'req_NotaCorr0001', {});

    expect(respuesta.status).toBe(201);
    expect(analisis.status).toBe(200);
    expect(contextoDe(0).clinicalNotes).toEqual([]);
    const enviado = rag.capturadas[0]!.texto;
    for (const fragmento of [
      'Actualización de la nota corregida',
      PII_FX_T4A_A.cedula,
      PII_FX_T4A_A.telefono,
      PII_FX_T4A_A.nombre,
    ]) {
      expect(enviado).not.toContain(fragmento);
    }
  });

  it('no escribe el texto de la nota en los logs al corregirla [US-253 AC-6] [RN-10]', async () => {
    const patientId = await crearPacienteFxT4aA(escenario.mundo);

    const { respuesta, logger } = await corregirNotaConPii(patientId);

    expect(respuesta.status).toBe(201);
    expect(
      logger.lineas.some((l) => l['event'] === 'corrections.nota' && l['resultado'] === 'ok'),
    ).toBe(true);
    const registrado = logger.texto();
    for (const fragmento of [
      'Actualización de la nota corregida',
      PII_FX_T4A_A.cedula,
      PII_FX_T4A_A.telefono,
      'Rondón',
    ]) {
      expect(registrado).not.toContain(fragmento);
    }
  });
});
