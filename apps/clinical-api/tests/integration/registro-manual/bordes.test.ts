import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CUERPO_KI67,
  contarFilasDelPaciente,
  iniciarEscenarioDeRegistroManual,
  montarRegistroManual,
  sembrarEgresado,
  sembrarMamaFM2,
  type EscenarioDeRegistroManual,
} from '../../support/registro-manual.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9870;
const DIAGNOSTICO_VALIDO = { cancerType: 'mama', histology: 'carcinoma ductal' };
const RUTAS = ['biomarkers', 'diagnoses'] as const;
const cuerpoValidoDe = (ruta: (typeof RUTAS)[number]) =>
  ruta === 'biomarkers' ? CUERPO_KI67 : DIAGNOSTICO_VALIDO;
let escenario: EscenarioDeRegistroManual;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeRegistroManual('rm_bordes', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

function enviar(ruta: string, patientId: string, cuerpo: object, cookie: string | null) {
  const { app } = montarRegistroManual(escenario.mundo);
  const peticion = clienteVerificado(app).post(`/platform/patients/${patientId}/${ruta}`);
  return (cookie === null ? peticion : peticion.set('Cookie', cookie)).send(cuerpo);
}

describe('bordes del registro manual', () => {
  it.each(RUTAS)('responde 403 al admin sin crear filas en %s [US-110 AC-1]', async (ruta) => {
    const { patientId } = await sembrarMamaFM2(escenario.siembra);
    const antes = await contarFilasDelPaciente(escenario.mundo.cliente, patientId);

    const respuesta = await enviar(ruta, patientId, cuerpoValidoDe(ruta), escenario.cookieAdmin);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error).toBe('PERMISO_DENEGADO');
    expect(await contarFilasDelPaciente(escenario.mundo.cliente, patientId)).toEqual(antes);
  });

  it.each(RUTAS)(
    'responde 422 PACIENTE_EGRESADO sin crear filas en %s [US-110 AC-1] [RN-17]',
    async (ruta) => {
      const { patientId } = await sembrarEgresado(escenario.siembra);
      const antes = await contarFilasDelPaciente(escenario.mundo.cliente, patientId);

      const respuesta = await enviar(
        ruta,
        patientId,
        cuerpoValidoDe(ruta),
        escenario.cookieDoctor,
      );

      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error).toBe('PACIENTE_EGRESADO');
      expect(await contarFilasDelPaciente(escenario.mundo.cliente, patientId)).toEqual(antes);
    },
  );

  it.each(RUTAS)('responde 404 cuando el paciente no existe en %s [US-110 AC-1]', async (ruta) => {
    const respuesta = await enviar(
      ruta,
      '00000000-0000-4000-8000-00000000dead',
      cuerpoValidoDe(ruta),
      escenario.cookieDoctor,
    );

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error).toBe('NO_ENCONTRADO');
  });

  it.each(RUTAS)('responde 401 sin sesión y no crea filas en %s [US-110 AC-1]', async (ruta) => {
    const { patientId } = await sembrarMamaFM2(escenario.siembra);
    const antes = await contarFilasDelPaciente(escenario.mundo.cliente, patientId);

    const respuesta = await enviar(ruta, patientId, cuerpoValidoDe(ruta), null);

    expect(respuesta.status).toBe(401);
    expect(await contarFilasDelPaciente(escenario.mundo.cliente, patientId)).toEqual(antes);
  });

  it('no escribe el nombre, el valor ni la histología registrados en los logs [US-110 AC-1] [RN-10]', async () => {
    const { patientId } = await sembrarMamaFM2(escenario.siembra);
    const montaje = montarRegistroManual(escenario.mundo);
    const cliente = clienteVerificado(montaje.app);

    const biomarcador = await cliente
      .post(`/platform/patients/${patientId}/biomarkers`)
      .set('Cookie', escenario.cookieDoctor)
      .send({
        name: 'marcador XYZ',
        value: 'positivo',
        resultType: 'cualitativo',
        performedAt: '2026-09-10',
      });
    const diagnostico = await cliente
      .post(`/platform/patients/${patientId}/diagnoses`)
      .set('Cookie', escenario.cookieDoctor)
      .send({ histology: 'carcinoma ductal' });

    expect(biomarcador.status).toBe(201);
    expect(diagnostico.status).toBe(201);
    const logs = montaje.logger.texto();
    for (const dato of ['marcador XYZ', 'positivo', 'carcinoma ductal']) {
      expect(logs).not.toContain(dato);
    }
    expect(logs).toContain(patientId);
  });
});
