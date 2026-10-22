import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearPacienteFxT4aA } from '../../support/gateway.js';
import { FX_T4A_A, servicioDeIdentidad } from '../../support/identidad.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 2023;
let escenario: EscenarioDePacientes;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('pac_integridad', ESPACIO_DE_IDS);
  const idDeFx = await crearPacienteFxT4aA(
    escenario.mundo,
    servicioDeIdentidad(escenario.mundo.cliente),
  );
  // Altera un byte del nombre cifrado con SQL crudo (la etiqueta GCM deja de coincidir, US-046 AC-3).
  await escenario.mundo.cliente.query(
    `UPDATE identity.patient_identity
        SET full_name_ciphertext = set_byte(full_name_ciphertext, 20, get_byte(full_name_ciphertext, 20) # 1)
      WHERE patient_id = $1`,
    [idDeFx],
  );
});
afterAll(() => escenario.cerrar());

describe('identidad alterada en la página', () => {
  it('responde 500 ErrorInterno sin identidad cuando un blob de la página está alterado [US-046 AC-3]', async () => {
    const { app } = montarPacientes(escenario.mundo, { pageSize: 10 });

    const respuesta = await clienteVerificado(app)
      .get('/platform/patients')
      .set('Cookie', escenario.cookieDoctor);

    expect(respuesta.status).toBe(500);
    expect(respuesta.body.error).toBe('ERROR_INTERNO');
    const texto = JSON.stringify(respuesta.body).toLowerCase();
    for (const prohibido of [FX_T4A_A.numeroDeDocumento, 'lucía', 'rondón']) {
      expect(texto).not.toContain(prohibido.toLowerCase());
    }
  });

  it('responde 500 ErrorInterno cuando la búsqueda por documento encuentra al paciente alterado [US-046 AC-3]', async () => {
    const { app } = montarPacientes(escenario.mundo, { pageSize: 10 });

    const respuesta = await clienteVerificado(app)
      .post('/platform/patients/search')
      .set('Cookie', escenario.cookieDoctor)
      .send({ idType: FX_T4A_A.idType, nationalId: FX_T4A_A.numeroDeDocumento });

    expect(respuesta.status).toBe(500);
    expect(respuesta.body.error).toBe('ERROR_INTERNO');
  });
});
