import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { idDePaciente } from '../../support/gateway.js';
import {
  documentosDelPaciente,
  fixture,
  iniciarEscenarioDeDocumentos,
  montarDocumentos,
  type EscenarioDeDocumentos,
} from '../../support/documentos.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 567;
const PACIENTE = idDePaciente('a');
let escenario: EscenarioDeDocumentos;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeDocumentos('doc_compensacion', ESPACIO_DE_IDS);
});
beforeEach(() => escenario.entorno.reiniciar());
afterAll(() => escenario.cerrar());

describe('compensación de la carga', () => {
  it('borra el objeto recién escrito y responde 500 sin fila cuando el INSERT del documento falla', async () => {
    const { app } = montarDocumentos(escenario.mundo);
    await escenario.mundo.cliente.query(`
      CREATE FUNCTION clinical.test_falla_insercion_documento() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fallo sintetico de test'; END $$`);
    await escenario.mundo.cliente.query(`
      CREATE TRIGGER test_falla_insercion_documento BEFORE INSERT ON clinical.document
      FOR EACH ROW EXECUTE FUNCTION clinical.test_falla_insercion_documento()`);

    try {
      const respuesta = await clienteVerificado(app, {
        respuestasAjenasAlContrato: [
          {
            ruta: `/platform/patients/${PACIENTE}/documents`,
            status: 500,
            esquema: '#/components/schemas/ErrorInterno',
          },
        ],
      })
        .post(`/platform/patients/${PACIENTE}/documents`)
        .set('Cookie', escenario.cookieDoctor)
        .field('documentType', 'examen')
        .attach('file', fixture('mama-examen.pdf'), 'mama-examen.pdf');

      expect(respuesta.status).toBe(500);
    } finally {
      await escenario.mundo.cliente.query(
        'DROP TRIGGER test_falla_insercion_documento ON clinical.document',
      );
      await escenario.mundo.cliente.query(
        'DROP FUNCTION clinical.test_falla_insercion_documento()',
      );
    }

    expect(escenario.entorno.escrituras()).toBe(1);
    expect(escenario.entorno.objetos().size).toBe(0);
    expect(await documentosDelPaciente(escenario.mundo, PACIENTE)).toHaveLength(0);
  });
});
