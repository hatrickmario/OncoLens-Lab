import request from 'supertest';
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
  type MundoDeGateway,
} from '../../support/gateway.js';
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

  it('no deja nombre, documento, índice ciego, fecha absoluta ni pseudoPatientId en la Base cuando se analiza FX-T4a-a [RN-10]', async () => {
    const identidad = servicioDeIdentidad(mundo.cliente);
    const { app } = await montarGateway(mundo, { identidades: crearLectorDeIdentidad(identidad) });
    const patientId = await crearPacienteFxT4aA(mundo, identidad);

    const respuesta = await request(app)
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
    expect(etiquetasConDatoAbsoluto(etiquetas, enviado.clinicalContext.pseudoPatientId)).toEqual(
      [],
    );
  });
});
