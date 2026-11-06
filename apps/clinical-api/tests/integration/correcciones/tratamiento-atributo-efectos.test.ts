import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  iniciarEscenarioDeCorrecciones,
  montarCorrecciones,
  type EscenarioDeCorrecciones,
} from '../../support/correcciones.js';
import {
  ATRIBUTO_MENOPAUSIA,
  TRATAMIENTO_AC_T,
  mamaConDatosSinVerificar,
  registrarAtributo,
  registrarTratamiento,
  vistaDeCaso,
} from '../../support/correcciones-tratamiento-atributo.js';
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  crearPacienteFxT4aA,
  leerRegistroPorTrace,
  montarGateway,
  ragSimulado,
} from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9995;
const rag = ragSimulado();
let escenario: EscenarioDeCorrecciones;

beforeAll(async () => {
  rag.iniciar();
  escenario = await iniciarEscenarioDeCorrecciones('corr_trat_attr_efectos', ESPACIO_DE_IDS);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await escenario.cerrar();
});

interface ContextoEnviado {
  priorTreatments: { regimenName: string }[];
  attributes: { key: string; value: string }[];
}

const contextoDe = (indice: number): ContextoEnviado =>
  rag.capturadas[indice]!.cuerpo['clinicalContext'] as ContextoEnviado;

async function analizar(patientId: string, traceId: string) {
  const { app } = await montarGateway(escenario.mundo, {
    traceIds: { traceId: () => traceId },
    identidades: lectorDeIdentidadFalso({}),
  });
  return clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', escenario.cookieDoctor)
    .send({ patientId, query: PREGUNTA_Q_HER2, sourcesSelected: TODAS_LAS_FUENTES });
}

function corregir(ruta: string, cuerpo: object, app = montarCorrecciones(escenario.mundo)) {
  return clienteVerificado(app.app).post(ruta).set('Cookie', escenario.cookieDoctor).send(cuerpo);
}

async function idVigente(
  tabla: 'prior_treatment' | 'clinical_attribute',
  patientId: string,
): Promise<string> {
  const { rows } = await escenario.mundo.cliente.query<{ id: string }>(
    `SELECT id FROM clinical.${tabla} WHERE patient_id = $1 AND review_status NOT IN ('rechazado', 'reemplazado')`,
    [patientId],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('el paciente sintético no tiene el dato vigente');
  return id;
}

describe('efecto de corregir un tratamiento o un atributo en el checklist', () => {
  it('pasa los ítems de presente_sin_verificar a presente_verificado cuando el doctor corrige el tratamiento y el atributo sin verificar [d5fb-05 AC-8] [RN-26] [AC-04.1]', async () => {
    const paciente = await mamaConDatosSinVerificar(escenario);
    const { patientId } = paciente;
    const antes = await vistaDeCaso(escenario, patientId);
    const tratamiento = await idVigente('prior_treatment', patientId);
    const atributo = await idVigente('clinical_attribute', patientId);

    const deTratamiento = await corregir(
      `/platform/patients/${patientId}/prior-treatments/${tratamiento}/corrections`,
      { ...TRATAMIENTO_AC_T, regimenName: 'FEC' },
    );
    const deAtributo = await corregir(
      `/platform/patients/${patientId}/clinical-attributes/${atributo}/corrections`,
      { value: 'premenopausica' },
    );
    const despues = await vistaDeCaso(escenario, patientId);

    const estadoDe = (vista: typeof antes, item: string) =>
      vista.completeness.find((fila) => fila.item === item)?.status;
    expect([deTratamiento.status, deAtributo.status]).toEqual([201, 201]);
    expect(estadoDe(antes, 'tratamientos_previos')).toBe('presente_sin_verificar');
    expect(estadoDe(antes, 'estado_menopausico')).toBe('presente_sin_verificar');
    expect(estadoDe(despues, 'tratamientos_previos')).toBe('presente_verificado');
    expect(estadoDe(despues, 'estado_menopausico')).toBe('presente_verificado');
  });
});

describe('efecto de corregir un tratamiento o un atributo en el análisis', () => {
  it('cambia la huella y el contexto del análisis nuevo y conserva intacto el registro previo cuando se corrigen el tratamiento y el atributo [d5fb-05 AC-9] [RN-06] [RN-07] [RN-26]', async () => {
    const patientId = await crearPacienteFxT4aA(escenario.mundo);
    const tratamiento = await registrarTratamiento(escenario, patientId);
    const atributo = await registrarAtributo(escenario, patientId, ATRIBUTO_MENOPAUSIA);
    const previo = await analizar(patientId, 'req_TrAt00001');
    expect(previo.status).toBe(200);
    const registroPrevio = await leerRegistroPorTrace(escenario.mundo.cliente, 'req_TrAt00001');
    expect(contextoDe(0).priorTreatments.map((t) => t.regimenName)).toEqual(['AC-T']);
    expect(contextoDe(0).attributes).toContainEqual(
      expect.objectContaining({ key: 'estado_menopausico', value: 'posmenopausica' }),
    );

    const deTratamiento = await corregir(
      `/platform/patients/${patientId}/prior-treatments/${tratamiento}/corrections`,
      { ...TRATAMIENTO_AC_T, regimenName: 'FEC' },
    );
    const deAtributo = await corregir(
      `/platform/patients/${patientId}/clinical-attributes/${atributo}/corrections`,
      { value: 'premenopausica' },
    );
    const nuevo = await analizar(patientId, 'req_TrAt00002');

    expect([deTratamiento.status, deAtributo.status, nuevo.status]).toEqual([201, 201, 200]);
    const registroNuevo = await leerRegistroPorTrace(escenario.mundo.cliente, 'req_TrAt00002');
    expect(registroNuevo?.context_fingerprint).not.toBe(registroPrevio?.context_fingerprint);
    expect(contextoDe(1).priorTreatments.map((t) => t.regimenName)).toEqual(['FEC']);
    expect(contextoDe(1).attributes).toContainEqual(
      expect.objectContaining({ key: 'estado_menopausico', value: 'premenopausica' }),
    );
    expect(contextoDe(1).attributes).not.toContainEqual(
      expect.objectContaining({ value: 'posmenopausica' }),
    );
    const previoDespues = await leerRegistroPorTrace(escenario.mundo.cliente, 'req_TrAt00001');
    expect(previoDespues?.context_fingerprint).toBe(registroPrevio?.context_fingerprint);
    expect(previoDespues?.clinical_context_snapshot).toEqual(
      registroPrevio?.clinical_context_snapshot,
    );
  });
});

describe('los logs de la corrección no llevan valores clínicos (RN-10)', () => {
  it('registra patientId, resultado y traceId sin el esquema, el valor ni las fechas cuando se corrige un tratamiento y un atributo [d5fb-05 AC-10]', async () => {
    const { patientId } = await mamaConDatosSinVerificar(escenario);
    const tratamiento = await idVigente('prior_treatment', patientId);
    const atributo = await idVigente('clinical_attribute', patientId);
    const app = montarCorrecciones(escenario.mundo);

    const deTratamiento = await corregir(
      `/platform/patients/${patientId}/prior-treatments/${tratamiento}/corrections`,
      { ...TRATAMIENTO_AC_T, regimenName: 'Esquema reservado QZX' },
      app,
    );
    const deAtributo = await corregir(
      `/platform/patients/${patientId}/clinical-attributes/${atributo}/corrections`,
      { value: 'perimenopausica' },
      app,
    );

    expect([deTratamiento.status, deAtributo.status]).toEqual([201, 201]);
    for (const evento of ['corrections.tratamiento', 'corrections.atributo']) {
      expect(app.logger.lineas).toContainEqual(
        expect.objectContaining({ event: evento, resultado: 'ok', patientId }),
      );
    }
    const registrado = app.logger.texto();
    for (const fragmento of ['Esquema reservado QZX', 'perimenopausica', 'AC-T', '2026-03-10']) {
      expect(registrado).not.toContain(fragmento);
    }
  });
});
