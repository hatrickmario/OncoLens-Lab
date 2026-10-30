import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montarCompletitud } from '../../support/completitud-http.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9505;
let escenario: EscenarioDePacientes;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('compl_404', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

describe('404 de la ficha y de /completeness', () => {
  it.each([
    ['un UUID inexistente', '00000000-0000-4000-8000-00000000dead'],
    ['un identificador mal formado', 'no-es-un-uuid'],
  ])('devuelven el mismo estado y cuerpo cuando el paciente es %s', async (_caso, id) => {
    const { app: appFicha } = montarPacientes(escenario.mundo);
    const { app: appChecklist } = montarCompletitud(escenario.mundo);

    const ficha = await clienteVerificado(appFicha)
      .get(`/platform/patients/${id}`)
      .set('Cookie', escenario.cookieDoctor);
    const checklist = await clienteVerificado(appChecklist)
      .get(`/platform/patients/${id}/completeness`)
      .set('Cookie', escenario.cookieDoctor);

    expect(ficha.status).toBe(404);
    expect(checklist.status).toBe(404);
    expect(checklist.body).toEqual(ficha.body);
  });
});
