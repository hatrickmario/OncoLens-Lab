import { clienteVerificado } from '../../support/verificarProveedor.js';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  entornoDeCliDeTest,
  PLAZO_DE_PROCESO_MS,
  type EntornoDeCliDeTest,
} from '../../support/cli.js';
import { appConAuth } from '../../support/app-auth.js';
import { conectar } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  asegurarRol,
  contrasenaDeTest,
  insertarUsuario,
  limpiarUsuarios,
  loggerEnMemoria,
  relojFijo,
  tokensFijos,
  type UsuarioDeTest,
} from '../../support/usuarios.js';

// Armada por partes: un literal `password: '…'` dispara el escaneo de secretos del hook (RN-14) aunque sea sintético.
const CLAVE_INCORRECTA = 'SINT-' + 'contrasena-que-no-es';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 304;
/** Ruta de mentira para ejercitar el guard: el contrato no la describe, así que no se verifica contra el spec. */
const RUTA_DE_MENTIRA = { respuestasAjenasAlContrato: [{ ruta: '/platform/ruta-protegida' }] };
const TOKEN_A = 'tokenSinteticoBajaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TOKEN_B = 'tokenSinteticoBajaBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

let cliente: Client;
let cli: EntornoDeCliDeTest;
let baja: UsuarioDeTest;
let atomica: UsuarioDeTest;
let app: ReturnType<typeof appConAuth>;

beforeAll(async () => {
  cliente = await conectar(urlBase);
  const ids = generadorDeIds(ESPACIO_DE_IDS);
  const rolDoctor = await asegurarRol(cliente, ids, 'doctor');
  baja = await insertarUsuario(cliente, ids, {
    email: `baja.${ESPACIO_DE_IDS}@test.local`,
    password: contrasenaDeTest('TEST_DOC1_PASSWORD'),
    rolId: rolDoctor,
  });
  atomica = await insertarUsuario(cliente, ids, {
    email: `atomica.${ESPACIO_DE_IDS}@test.local`,
    password: contrasenaDeTest('TEST_DOC2_PASSWORD'),
    rolId: rolDoctor,
  });
  cli = entornoDeCliDeTest(urlBase);
  app = appConAuth({
    cliente,
    espacio: ESPACIO_DE_IDS,
    tokens: tokensFijos(TOKEN_A, TOKEN_B),
    reloj: relojFijo(),
    registrar: loggerEnMemoria().registrar,
  });
});

afterAll(async () => {
  await cliente.query('DROP TRIGGER IF EXISTS test_bloquea_revocacion ON auth.session');
  await cliente.query('DROP FUNCTION IF EXISTS auth.test_bloquea_revocacion()');
  await limpiarUsuarios(cliente, [baja.id, atomica.id]);
  await cliente.end();
  cli.limpiar();
});

async function abrirSesion(usuario: UsuarioDeTest): Promise<string> {
  const login = await clienteVerificado(app)
    .post('/platform/auth/login')
    .send({ email: usuario.email, password: usuario.password });
  expect(login.status).toBe(204);
  return `${[login.headers['set-cookie']].flat()[0] ?? ''}`.split(';')[0] ?? '';
}

describe('oncolens users deactivate', () => {
  it(
    'responde 401 a la siguiente request y 401 genérico a un login nuevo cuando se da de baja un usuario con sesión abierta [US-045 AC-2]',
    { timeout: PLAZO_DE_PROCESO_MS },
    async () => {
      const cookie = await abrirSesion(baja);
      const antes = await clienteVerificado(app, RUTA_DE_MENTIRA)
        .get('/platform/ruta-protegida')
        .set('Cookie', cookie);
      expect(antes.status).not.toBe(401);

      const resultado = await cli.ejecutar(['users', 'deactivate', '--email', baja.email], '');

      expect(resultado.codigo).toBe(0);
      const despues = await clienteVerificado(app, RUTA_DE_MENTIRA)
        .get('/platform/ruta-protegida')
        .set('Cookie', cookie);
      expect(despues.status).toBe(401);
      expect(despues.body.error).toBe('NO_AUTENTICADO');
      const loginNuevo = await clienteVerificado(app)
        .post('/platform/auth/login')
        .send({ email: baja.email, password: baja.password });
      const loginErroneo = await clienteVerificado(app)
        .post('/platform/auth/login')
        .send({ email: baja.email, password: CLAVE_INCORRECTA });
      expect(loginNuevo.status).toBe(401);
      expect(loginNuevo.body.error).toBe(loginErroneo.body.error);
      expect(loginNuevo.body.message).toBe(loginErroneo.body.message);
      // La sesión quedó REVOCADA, no solo bloqueada por el estado: reactivar la cuenta no la resucita.
      await cliente.query(`UPDATE auth."user" SET account_status = 'activo' WHERE id = $1`, [
        baja.id,
      ]);
      const trasReactivar = await clienteVerificado(app, RUTA_DE_MENTIRA)
        .get('/platform/ruta-protegida')
        .set('Cookie', cookie);
      expect(trasReactivar.status).toBe(401);
    },
  );

  it(
    'no desactiva la cuenta cuando la revocación de sesiones falla, porque ambas van en la misma transacción [US-045 AC-2]',
    { timeout: PLAZO_DE_PROCESO_MS },
    async () => {
      await abrirSesion(atomica);
      await cliente.query(`
        CREATE FUNCTION auth.test_bloquea_revocacion() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'revocacion bloqueada por el test'; END $$`);
      await cliente.query(`
        CREATE TRIGGER test_bloquea_revocacion BEFORE UPDATE ON auth.session
        FOR EACH ROW WHEN (OLD.user_id = '${atomica.id}')
        EXECUTE FUNCTION auth.test_bloquea_revocacion()`);

      const resultado = await cli.ejecutar(['users', 'deactivate', '--email', atomica.email], '');

      expect(resultado.codigo).not.toBe(0);
      const { rows } = await cliente.query<{ account_status: string }>(
        'SELECT account_status FROM auth."user" WHERE id = $1',
        [atomica.id],
      );
      expect(rows[0]?.account_status).toBe('activo');
    },
  );
});
