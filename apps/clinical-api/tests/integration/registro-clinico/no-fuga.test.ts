import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sembrarPCaso } from '../../support/caso.js';
import { TRACE_ID_GENERADO } from '../../support/gateway.js';
import { montarRegistroClinico } from '../../support/registro-clinico.js';
import {
  iniciarEscenarioDeRegistroManual,
  type EscenarioDeRegistroManual,
} from '../../support/registro-manual.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9120;
let escenario: EscenarioDeRegistroManual;
let pCaso: string;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeRegistroManual('rc_no_fuga', ESPACIO_DE_IDS);
  pCaso = (await sembrarPCaso(escenario.siembra)).patientId;
});
afterAll(() => escenario.cerrar());

describe('los logs del registro manual de tratamientos y atributos', () => {
  it('llevan traceId, paciente, resultado y mappingStatus y no el esquema, la clave ni el valor registrados [US-094 AC-1] [RN-10]', async () => {
    const montaje = montarRegistroClinico(escenario.mundo);
    const cliente = clienteVerificado(montaje.app);
    const enviar = (ruta: string, cuerpo: object) =>
      cliente
        .post(`/platform/patients/${pCaso}/${ruta}`)
        .set('Cookie', escenario.cookieDoctor)
        .send(cuerpo);

    const tratamiento = await enviar('prior-treatments', {
      setting: 'otro',
      regimenName: 'Fármaco experimental X',
      ongoing: false,
      endReason: 'desconocido',
    });
    const rechazado = await enviar('clinical-attributes', {
      attributeKey: 'color_ojos',
      value: 'azules',
    });
    const atributo = await enviar('clinical-attributes', {
      attributeKey: 'estado_castracion',
      value: 'castrado',
    });
    const lectura = await cliente
      .get(`/platform/patients/${pCaso}/clinical-attributes`)
      .set('Cookie', escenario.cookieDoctor);

    expect([tratamiento.status, rechazado.status, atributo.status, lectura.status]).toEqual([
      201, 422, 201, 200,
    ]);
    const logs = montaje.logger.texto();
    for (const dato of ['Fármaco experimental X', 'color_ojos', 'azules', 'castrado']) {
      expect(logs).not.toContain(dato);
    }
    expect(logs).toContain(pCaso);
    expect(logs).toContain(TRACE_ID_GENERADO);
    const delTratamiento = montaje.logger.lineas.find(
      (linea) => linea['event'] === 'prior_treatments.registro',
    );
    expect(delTratamiento).toMatchObject({ resultado: 'ok', mappingStatus: 'no_mapeado' });
  });
});
