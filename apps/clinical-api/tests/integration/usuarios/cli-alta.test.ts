import { clienteVerificado } from '../../support/verificarProveedor.js';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { appConAuth } from '../../support/app-auth.js';
import {
  entornoDeCliDeTest,
  PLAZO_DE_PROCESO_MS,
  type EntornoDeCliDeTest,
} from '../../support/cli.js';
import { conectar } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  asegurarRol,
  contrasenaDeTest,
  loggerEnMemoria,
  relojFijo,
  tokensFijos,
} from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 301;
const CORREO_ALTA = `doc3.${ESPACIO_DE_IDS}@test.local`;
const CORREO_ROL_INEXISTENTE = `doc4.${ESPACIO_DE_IDS}@test.local`;
const CORREO_SECRETO = `doc5.${ESPACIO_DE_IDS}@test.local`;

let cliente: Client;
let cli: EntornoDeCliDeTest;

beforeAll(async () => {
  cliente = await conectar(urlBase);
  await asegurarRol(cliente, generadorDeIds(ESPACIO_DE_IDS), 'doctor');
  cli = entornoDeCliDeTest(urlBase);
});

afterAll(async () => {
  await cliente.query(
    `DELETE FROM auth.session WHERE user_id IN (SELECT id FROM auth."user" WHERE email = ANY($1))`,
    [[CORREO_ALTA, CORREO_ROL_INEXISTENTE, CORREO_SECRETO]],
  );
  await cliente.query('DELETE FROM auth."user" WHERE email = ANY($1)', [
    [CORREO_ALTA, CORREO_ROL_INEXISTENTE, CORREO_SECRETO],
  ]);
  await cliente.end();
  cli.limpiar();
});

async function filasDeUsuario(correo: string) {
  const { rows } = await cliente.query<{
    id: string;
    password_hash: string;
    account_status: string;
    rol: string;
  }>(
    `SELECT u.id, u.password_hash, u.account_status, r.name AS rol
       FROM auth."user" u JOIN auth.role r ON r.id = u.role_id WHERE u.email = $1`,
    [correo],
  );
  return rows;
}

describe('oncolens users create', () => {
  it(
    'crea un usuario activo con hash Argon2id que inicia sesión con 204 cuando se ejecuta users create con la contraseña por stdin [US-045 AC-1]',
    { timeout: PLAZO_DE_PROCESO_MS },
    async () => {
      const contrasena = contrasenaDeTest('TEST_DOC1_PASSWORD');

      const resultado = await cli.ejecutar(
        ['users', 'create', '--email', CORREO_ALTA, '--role', 'doctor'],
        `${contrasena}\n`,
      );

      expect(resultado.codigo).toBe(0);
      const filas = await filasDeUsuario(CORREO_ALTA);
      expect(filas).toHaveLength(1);
      expect(filas[0]?.account_status).toBe('activo');
      expect(filas[0]?.rol).toBe('doctor');
      expect(filas[0]?.password_hash.startsWith('$argon2id$')).toBe(true);
      const app = appConAuth({
        cliente,
        espacio: ESPACIO_DE_IDS,
        tokens: tokensFijos('tokenSinteticoCliAltaAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
        reloj: relojFijo(),
        registrar: loggerEnMemoria().registrar,
      });
      const login = await clienteVerificado(app)
        .post('/platform/auth/login')
        .send({ email: CORREO_ALTA, password: contrasena });
      expect(login.status).toBe(204);
    },
  );

  it(
    'termina con código distinto de 0 sin crear el usuario y nombrando --role cuando el rol no existe',
    { timeout: PLAZO_DE_PROCESO_MS },
    async () => {
      const resultado = await cli.ejecutar(
        ['users', 'create', '--email', CORREO_ROL_INEXISTENTE, '--role', 'superusuario'],
        `${contrasenaDeTest('TEST_DOC1_PASSWORD')}\n`,
      );

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.codigo).not.toBeNull();
      expect(resultado.stderr).toContain('--role');
      expect(await filasDeUsuario(CORREO_ROL_INEXISTENTE)).toHaveLength(0);
    },
  );

  it(
    'no imprime la contraseña ni en stdout ni en stderr ni en los logs cuando crea un usuario [US-045 AC-5]',
    { timeout: PLAZO_DE_PROCESO_MS },
    async () => {
      const contrasena = contrasenaDeTest('TEST_DOC2_PASSWORD');

      const resultado = await cli.ejecutar(
        ['users', 'create', '--email', CORREO_SECRETO, '--role', 'doctor'],
        `${contrasena}\n`,
      );

      expect(resultado.codigo).toBe(0);
      expect(resultado.stdout).not.toContain(contrasena);
      expect(resultado.stderr).not.toContain(contrasena);
      expect(resultado.stdout).toContain(CORREO_SECRETO);
    },
  );
});
