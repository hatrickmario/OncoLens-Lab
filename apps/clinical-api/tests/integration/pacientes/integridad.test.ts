import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearPacienteFxT4aA } from '../../support/gateway.js';
import {
  FX_T4A_A,
  insertarPacienteSintetico,
  servicioDeIdentidad,
} from '../../support/identidad.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 2023;
let escenario: EscenarioDePacientes;
let idDeFx: string;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('pac_integridad', ESPACIO_DE_IDS);
  idDeFx = await crearPacienteFxT4aA(escenario.mundo, servicioDeIdentidad(escenario.mundo.cliente));
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

  it('responde 500 ErrorInterno cuando un paciente de la página no tiene identidad guardada [US-046 AC-3]', async () => {
    await insertarPacienteSintetico(escenario.mundo.cliente, escenario.mundo.ids);
    const { app } = montarPacientes(escenario.mundo, { pageSize: 10 });

    const respuesta = await clienteVerificado(app)
      .get('/platform/patients?dataOrigin=sintetico')
      .set('Cookie', escenario.cookieAdmin);

    expect(respuesta.status).toBe(500);
    expect(respuesta.body.error).toBe('ERROR_INTERNO');
  });

  it('responde 500 ErrorInterno sin identidad cuando la ficha del paciente tiene un blob alterado [US-046 AC-3]', async () => {
    const { app } = montarPacientes(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .get(`/platform/patients/${idDeFx}`)
      .set('Cookie', escenario.cookieDoctor);

    expect(respuesta.status).toBe(500);
    expect(respuesta.body.error).toBe('ERROR_INTERNO');
    expect(JSON.stringify(respuesta.body)).not.toContain(FX_T4A_A.numeroDeDocumento);
  });
});
