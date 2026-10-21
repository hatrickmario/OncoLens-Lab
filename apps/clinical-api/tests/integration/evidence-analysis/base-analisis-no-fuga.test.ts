import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { crearLectorDeIdentidad } from '../../../src/modules/evidence-analysis/deidentification/patient-identity.reader.js';
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  abrirSesion,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  PII_FX_T4A_A,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import { configuracionDePiiDeTest } from '../../support/desidentificacion.js';
import { INSTANTE_FIJO, insertar } from '../../support/filas-sinteticas.js';
import { servicioDeIdentidad } from '../../support/identidad.js';
import {
  buscarFugaDeIdentidad,
  etiquetasConDatoAbsoluto,
  fuenteDeLaBaseDelAnalisis,
  valoresDeIdentidad,
} from '../../support/no-fuga.js';

const ESPACIO_DE_IDS = 664;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-base-nofuga-0001';

describe('La Base del análisis no filtra identidad (RN-10, RN-11)', () => {
  const rag = ragSimulado();
  let mundo: MundoDeGateway;
  let cookie: string;

  beforeAll(async () => {
    rag.iniciar();
    mundo = await prepararMundoConSeed('base_analisis_nofuga', ESPACIO_DE_IDS);
    cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  });
  afterEach(() => rag.reiniciar());
  afterAll(async () => {
    rag.detener();
    await mundo.cerrar();
  });

  /** PII sintética (nombre, texto libre y fecha ISO) en los campos que `verbalizarDatoDelContexto()` sí escribe. */
  async function sembrarPiiEnCamposDelContexto(patientId: string): Promise<void> {
    const sembrado = `${PII_FX_T4A_A.nombre} (CC ${PII_FX_T4A_A.cedula}) 2026-08-16`;
    const { cliente, ids } = mundo;
    await cliente.query('UPDATE clinical.diagnosis SET stage_value = $2 WHERE patient_id = $1', [
      patientId,
      sembrado,
    ]);
    await cliente.query(
      `UPDATE clinical.biomarker SET value = $2
        WHERE exam_id IN (SELECT id FROM clinical.exam WHERE patient_id = $1)`,
      [patientId, sembrado],
    );
    await cliente.query(
      'UPDATE clinical.prior_treatment SET regimen_name = $2 WHERE patient_id = $1',
      [patientId, sembrado],
    );
    const { rows } = await cliente.query<{ id: string }>(
      'SELECT id FROM clinical.care_episode WHERE patient_id = $1',
      [patientId],
    );
    await insertar(cliente, 'clinical.clinical_attribute', {
      id: ids(),
      patient_id: patientId,
      episode_id: rows[0]?.id ?? '',
      attribute_key: 'antecedente',
      value: sembrado,
      observed_at: null,
      date_precision: 'dia',
      entry_method: 'seed',
      extraction_confidence: 'n_a',
      review_status: 'verificado',
      created_at: INSTANTE_FIJO,
    });
  }

  it('no deja nombre, documento, índice ciego, fecha absoluta ni pseudoPatientId en la Base cuando se analiza FX-T4a-a [RN-10]', async () => {
    const identidad = servicioDeIdentidad(mundo.cliente);
    const { app } = await montarGateway(mundo, { identidades: crearLectorDeIdentidad(identidad) });
    const patientId = await crearPacienteFxT4aA(mundo, identidad);
    await sembrarPiiEnCamposDelContexto(patientId);

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({ patientId, query: PREGUNTA_Q_HER2, sourcesSelected: TODAS_LAS_FUENTES });

    expect(respuesta.status).toBe(200);
    const etiquetas = (respuesta.body.analysisBasis.patientDataUsed as { label: string }[]).map(
      ({ label }) => label,
    );
    expect(etiquetas.length).toBeGreaterThan(0);
    const guardada = await identidad.descifrar(patientId);
    const { rows } = await mundo.cliente.query<{ national_id_hmac: string }>(
      'SELECT national_id_hmac FROM identity.patient_identity WHERE patient_id = $1',
      [patientId],
    );
    expect(
      buscarFugaDeIdentidad(
        [...valoresDeIdentidad(guardada!), ...rows.map((fila) => fila.national_id_hmac)],
        [fuenteDeLaBaseDelAnalisis(respuesta.body.analysisBasis)],
      ),
    ).toEqual([]);
    const enviado = rag.capturadas[0]!.cuerpo as { clinicalContext: { pseudoPatientId: string } };
    expect(
      etiquetasConDatoAbsoluto(
        etiquetas,
        enviado.clinicalContext.pseudoPatientId,
        configuracionDePiiDeTest().fechas.expresiones,
      ),
    ).toEqual([]);
  });
});
