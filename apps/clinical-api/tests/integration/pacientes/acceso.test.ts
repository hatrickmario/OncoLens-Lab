import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirSesionDeUsuarioConRol, crearRolDePrueba } from '../../support/roles.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { contrasenaDeTest } from '../../support/usuarios.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 2026;
const TOKEN = 'SINT-cookie-sin-busqueda-0001';
let escenario: EscenarioDePacientes;
let cookieSinPermiso: string;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('pac_acceso', ESPACIO_DE_IDS);
  const { mundo } = escenario;
  // Un rol que existe y tiene permisos, pero no `patients:lookup`.
  const rolId = await crearRolDePrueba(mundo.cliente, mundo.ids, 'sin_busqueda_de_pacientes', [
    'ai_analysis:create',
  ]);
  ({ cookie: cookieSinPermiso } = await abrirSesionDeUsuarioConRol(mundo.cliente, mundo.ids, {
    email: `sin-busqueda-${ESPACIO_DE_IDS}@example.invalid`,
    password: contrasenaDeTest('TEST_DOC1_PASSWORD'),
    rolId,
    tokenHash: createHash('sha256').update(TOKEN).digest('hex'),
    token: TOKEN,
  }));
});
afterAll(() => escenario.cerrar());

describe('permiso patients:lookup', () => {
  it('responde 403 PERMISO_DENEGADO sin datos en el listado cuando el rol no tiene patients:lookup [US-048 AC-6]', async () => {
    const { app } = montarPacientes(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .get('/platform/patients')
      .set('Cookie', cookieSinPermiso);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error).toBe('PERMISO_DENEGADO');
    expect(respuesta.body.items).toBeUndefined();
  });

  it('responde 403 PERMISO_DENEGADO antes de leer el cuerpo de la búsqueda cuando el rol no tiene patients:lookup [US-048 AC-6]', async () => {
    const { app, logger } = montarPacientes(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .post('/platform/patients/search')
      .set('Cookie', cookieSinPermiso)
      .send({ name: 'Prueba Sintética 1' });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error).toBe('PERMISO_DENEGADO');
    expect(logger.lineas.some((linea) => linea['event'] === 'patients.busqueda')).toBe(false);
  });
});
