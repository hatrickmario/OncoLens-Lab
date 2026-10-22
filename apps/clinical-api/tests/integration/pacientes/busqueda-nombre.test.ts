import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearPacienteFxT4aA } from '../../support/gateway.js';
import { FX_T4A_A, servicioDeIdentidad } from '../../support/identidad.js';
import type { IdentityService } from '../../../src/modules/patients/identity.service.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 2022;
const PAGE_SIZE = 10;
let escenario: EscenarioDePacientes;
let idDeFx: string;

/** El `IdentityService` real, instrumentado: cuenta los descifrados y a qué pacientes se pidieron. */
function servicioQueCuentaDescifrados(real: IdentityService) {
  const pedidos: string[][] = [];
  const servicio: IdentityService = {
    ...real,
    descifrar: (patientId) => {
      pedidos.push([patientId]);
      return real.descifrar(patientId);
    },
    descifrarVarios: (patientIds) => {
      pedidos.push([...patientIds]);
      return real.descifrarVarios(patientIds);
    },
  };
  return { servicio, pedidos };
}

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('pac_busqueda_nom', ESPACIO_DE_IDS);
  idDeFx = await crearPacienteFxT4aA(escenario.mundo, servicioDeIdentidad(escenario.mundo.cliente));
});
afterAll(() => escenario.cerrar());

function buscarPorNombre(name: string, identidad?: IdentityService) {
  const { app } = montarPacientes(escenario.mundo, {
    pageSize: PAGE_SIZE,
    ...(identidad !== undefined && { identidad }),
  });
  return clienteVerificado(app)
    .post('/platform/patients/search')
    .set('Cookie', escenario.cookieDoctor)
    .send({ name });
}

describe('búsqueda por nombre', () => {
  it('encuentra a FX-T4a-a con el nombre completo en otras mayúsculas, tildes y espacios [US-048 AC-3]', async () => {
    const respuesta = await buscarPorNombre('LUCIA  fernanda rondon PEÑA');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items.map((elemento: { id: string }) => elemento.id)).toEqual([idDeFx]);
    expect(respuesta.body.items[0].fullNameMasked).toBe('L. F. R. P.');
  });

  it('devuelve cero resultados cuando la búsqueda es un apellido suelto [US-048 AC-3]', async () => {
    const apellido = await buscarPorNombre(FX_T4A_A.apellido);
    const primerNombre = await buscarPorNombre(FX_T4A_A.nombre);

    expect(apellido.status).toBe(200);
    expect(apellido.body).toMatchObject({ items: [], total: 0 });
    expect(primerNombre.body).toMatchObject({ items: [], total: 0 });
  });

  it('no descifra ninguna identidad cuando el nombre buscado no existe [US-048 AC-3]', async () => {
    const { servicio, pedidos } = servicioQueCuentaDescifrados(
      servicioDeIdentidad(escenario.mundo.cliente),
    );

    const respuesta = await buscarPorNombre('Nombre Que No Existe', servicio);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items).toEqual([]);
    expect(pedidos).toEqual([]);
  });

  it('descifra solo la identidad del paciente encontrado y no las de los demás [US-048 AC-3]', async () => {
    const { servicio, pedidos } = servicioQueCuentaDescifrados(
      servicioDeIdentidad(escenario.mundo.cliente),
    );

    const respuesta = await buscarPorNombre(FX_T4A_A.nombreCompleto, servicio);

    expect(respuesta.status).toBe(200);
    expect(pedidos).toEqual([[idDeFx]]);
  });

  it('responde 422 sin consultar el índice cuando el nombre queda vacío tras normalizar [US-048 AC-3]', async () => {
    const { servicio, pedidos } = servicioQueCuentaDescifrados(
      servicioDeIdentidad(escenario.mundo.cliente),
    );

    const soloEspacios = await buscarPorNombre('   ', servicio);
    const soloMarcas = await buscarPorNombre('\u0301\u0301', servicio);

    expect(soloEspacios.status).toBe(422);
    expect(soloEspacios.body.error).toBe('CUERPO_INVALIDO');
    expect(soloMarcas.status).toBe(422);
    expect(pedidos).toEqual([]);
  });
});
