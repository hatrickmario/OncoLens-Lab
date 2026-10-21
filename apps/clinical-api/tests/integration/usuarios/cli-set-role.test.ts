import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  entornoDeCliDeTest,
  PLAZO_DE_PROCESO_MS,
  type EntornoDeCliDeTest,
} from '../../support/cli.js';
import { conectar } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import { asegurarRol, contrasenaDeTest, insertarUsuario } from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 303;
const CORREO = `cambio.${ESPACIO_DE_IDS}@test.local`;

let cliente: Client;
let cli: EntornoDeCliDeTest;

beforeAll(async () => {
  cliente = await conectar(urlBase);
  const ids = generadorDeIds(ESPACIO_DE_IDS);
  const rolDoctor = await asegurarRol(cliente, ids, 'doctor');
  await asegurarRol(cliente, ids, 'admin');
  await insertarUsuario(cliente, ids, {
    email: CORREO,
    password: contrasenaDeTest('TEST_DOC1_PASSWORD'),
    rolId: rolDoctor,
  });
  cli = entornoDeCliDeTest(urlBase);
});

afterAll(async () => {
  await cliente.query('DELETE FROM auth."user" WHERE email = $1', [CORREO]);
  await cliente.end();
  cli.limpiar();
});

async function rolDe(correo: string): Promise<string | undefined> {
  const { rows } = await cliente.query<{ rol: string }>(
    `SELECT r.name AS rol FROM auth."user" u JOIN auth.role r ON r.id = u.role_id WHERE u.email = $1`,
    [correo],
  );
  return rows[0]?.rol;
}

describe('oncolens users set-role', () => {
  it(
    'cambia el rol del usuario existente cuando el rol destino existe',
    { timeout: PLAZO_DE_PROCESO_MS },
    async () => {
      const resultado = await cli.ejecutar(
        ['users', 'set-role', '--email', CORREO, '--role', 'admin'],
        '',
      );

      expect(resultado.codigo).toBe(0);
      expect(await rolDe(CORREO)).toBe('admin');
    },
  );

  it(
    'termina con código distinto de 0 y deja el rol intacto cuando el rol destino no existe',
    { timeout: PLAZO_DE_PROCESO_MS },
    async () => {
      const resultado = await cli.ejecutar(
        ['users', 'set-role', '--email', CORREO, '--role', 'superusuario'],
        '',
      );

      expect(resultado.codigo).toBe(1);
      expect(resultado.stderr).toContain('--role');
      expect(await rolDe(CORREO)).toBe('admin');
    },
  );

  it(
    'termina con código 1 nombrando --email cuando el correo no existe',
    { timeout: PLAZO_DE_PROCESO_MS },
    async () => {
      const resultado = await cli.ejecutar(
        ['users', 'set-role', '--email', `nadie.${ESPACIO_DE_IDS}@test.local`, '--role', 'admin'],
        '',
      );

      expect(resultado.codigo).toBe(1);
      expect(resultado.stderr).toContain('--email');
    },
  );
});
