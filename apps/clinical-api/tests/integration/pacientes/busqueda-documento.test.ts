import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearPacienteFxT4aA } from '../../support/gateway.js';
import { FX_T4A_A, servicioDeIdentidad } from '../../support/identidad.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 2021;
const PAGE_SIZE = 10;
const MARCADOR = '••••';
let escenario: EscenarioDePacientes;
let idDeFx: string;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('pac_busqueda_doc', ESPACIO_DE_IDS);
  idDeFx = await crearPacienteFxT4aA(escenario.mundo, servicioDeIdentidad(escenario.mundo.cliente));
});
afterAll(() => escenario.cerrar());

const buscar = (cuerpo: object, cookie = escenario.cookieDoctor) => {
  const { app } = montarPacientes(escenario.mundo, { pageSize: PAGE_SIZE });
  return clienteVerificado(app)
    .post('/platform/patients/search')
    .set('Cookie', cookie)
    .send(cuerpo);
};

describe('búsqueda por documento', () => {
  it('encuentra exactamente a FX-T4a-a con el documento completo y cero con el número parcial [US-048 AC-2]', async () => {
    const completo = await buscar({
      idType: FX_T4A_A.idType,
      nationalId: FX_T4A_A.numeroDeDocumento,
    });
    const parcial = await buscar({ idType: FX_T4A_A.idType, nationalId: '12345' });

    expect(completo.status).toBe(200);
    expect(completo.body.total).toBe(1);
    expect(completo.body.items.map((elemento: { id: string }) => elemento.id)).toEqual([idDeFx]);
    expect(parcial.status).toBe(200);
    expect(parcial.body).toMatchObject({ items: [], total: 0 });
  });

  it('encuentra a FX-T4a-a aunque el documento traiga puntos y la búsqueda no lleve issuingCountry [US-048 AC-2]', async () => {
    await escenario.mundo.cliente.query(
      'UPDATE identity.patient_identity SET issuing_country = $1 WHERE patient_id = $2',
      ['CO', idDeFx],
    );

    const respuesta = await buscar({ idType: FX_T4A_A.idType, nationalId: '1.234.567' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items.map((elemento: { id: string }) => elemento.id)).toEqual([idDeFx]);
  });

  it('devuelve L. F. R. P., •••• 67 y •••• 01 sin la identidad en claro [US-048 AC-7]', async () => {
    const fx = await buscar({ idType: FX_T4A_A.idType, nationalId: FX_T4A_A.numeroDeDocumento });
    const semilla = await buscar({ idType: 'sintetico', nationalId: 'SINT-0000001' });

    expect([fx.status, semilla.status]).toEqual([200, 200]);
    expect(fx.body.items[0]).toMatchObject({
      view: 'doctor_listado',
      fullNameMasked: 'L. F. R. P.',
      nationalIdMasked: `${MARCADOR} 67`,
    });
    expect(semilla.body.items[0]).toMatchObject({ nationalIdMasked: `${MARCADOR} 01` });
    expect(semilla.body.items[0].nationalIdMasked).toHaveLength(
      fx.body.items[0].nationalIdMasked.length,
    );
    const texto = JSON.stringify(fx.body).toLowerCase();
    for (const prohibido of [FX_T4A_A.numeroDeDocumento, 'lucía', 'rondón', 'fernanda']) {
      expect(texto).not.toContain(prohibido.toLowerCase());
    }
  });

  it('responde 422 sin eco cuando el cuerpo no trae un criterio completo', async () => {
    for (const cuerpo of [{}, { idType: FX_T4A_A.idType }, { name: 'L' }]) {
      const respuesta = await buscar(cuerpo);
      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    }
  });

  it('responde 422 cuando el JSON está mal formado', async () => {
    const { app } = montarPacientes(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .post('/platform/patients/search')
      .set('Cookie', escenario.cookieDoctor)
      .set('Content-Type', 'application/json')
      .send('{"idType": ');

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
  });

  it('responde 401 sin datos cuando falta la cookie [US-048 AC-6]', async () => {
    const { app } = montarPacientes(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .post('/platform/patients/search')
      .send({ idType: FX_T4A_A.idType, nationalId: FX_T4A_A.numeroDeDocumento });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.items).toBeUndefined();
  });

  it('entrega al admin PatientAdminSummary sin nombre ni contadores clínicos [US-048 AC-7]', async () => {
    const respuesta = await buscar(
      { idType: FX_T4A_A.idType, nationalId: FX_T4A_A.numeroDeDocumento },
      escenario.cookieAdmin,
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items[0]).toMatchObject({
      view: 'admin',
      nationalIdMasked: `${MARCADOR} 67`,
    });
    expect(respuesta.body.items[0]).not.toHaveProperty('fullNameMasked');
    expect(respuesta.body.items[0]).not.toHaveProperty('pendingReviewCount');
  });

  it('responde Cache-Control: no-store cuando la búsqueda encuentra al paciente', async () => {
    const respuesta = await buscar({
      idType: FX_T4A_A.idType,
      nationalId: FX_T4A_A.numeroDeDocumento,
    });

    expect(respuesta.headers['cache-control']).toBe('no-store');
  });
});
