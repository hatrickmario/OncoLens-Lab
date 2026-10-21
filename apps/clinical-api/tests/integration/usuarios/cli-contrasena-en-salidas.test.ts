import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ejecutarCli, SALIDA_OK } from '../../../src/cli/ejecutar-cli.js';
import { crearRegistrador } from '../../../src/infrastructure/logger.js';
import { createPasswordHasher } from '../../../src/modules/auth/password-hasher.js';
import { createUsersRepository } from '../../../src/modules/users/users.repository.js';
import { createUsersService } from '../../../src/modules/users/users.service.js';
import { capturarSalidas } from '../../support/captura-de-salidas.js';
import { conectar } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  asegurarRol,
  ARGON2_DE_PRUEBA,
  contrasenaDeTest,
  relojFijo,
} from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 302;
const CORREOS = [`sonda1.${ESPACIO_DE_IDS}@test.local`, `sonda2.${ESPACIO_DE_IDS}@test.local`];

const ids = generadorDeIds(ESPACIO_DE_IDS + 1);
let cliente: Client;

beforeAll(async () => {
  cliente = await conectar(urlBase);
  await asegurarRol(cliente, generadorDeIds(ESPACIO_DE_IDS), 'doctor');
});

afterAll(async () => {
  await cliente.query('DELETE FROM auth."user" WHERE email = ANY($1)', [CORREOS]);
  await cliente.end();
});

/** Ejecuta el alta en el proceso de test capturando consola, flujos estándar y la salida de la CLI. */
async function altaCapturada(
  correo: string,
  contrasena: string,
  hasher = createPasswordHasher(ARGON2_DE_PRUEBA),
): Promise<string> {
  const salidas: string[] = [];
  const global = await capturarSalidas(async () => {
    const codigo = await ejecutarCli(
      ['users', 'create', '--email', correo, '--role', 'doctor'],
      {
        leerContrasena: () => Promise.resolve(contrasena),
        stdout: (texto) => salidas.push(texto),
        stderr: (texto) => salidas.push(texto),
      },
      {
        users: createUsersService({
          repo: createUsersRepository(cliente),
          hasher,
          reloj: relojFijo(),
          ids,
        }),
        registrar: crearRegistrador((linea) => salidas.push(linea)),
      },
    );
    expect(codigo).toBe(SALIDA_OK);
  });
  return `${global}\n${salidas.join('\n')}`;
}

describe('salidas de la CLI users create (en proceso)', () => {
  it('no contiene la contraseña en ninguna salida ni log cuando el alta termina bien [US-045 AC-5]', async () => {
    const contrasena = contrasenaDeTest('TEST_DOC2_PASSWORD');

    const todo = await altaCapturada(CORREOS[0] ?? '', contrasena);

    expect(todo).toContain(CORREOS[0]);
    expect(todo).not.toContain(contrasena);
  });

  it('detecta la contraseña cuando una dependencia la imprime por process.stdout (sonda de mutación de AC-5)', async () => {
    const contrasena = contrasenaDeTest('TEST_DOC2_PASSWORD');
    const real = createPasswordHasher(ARGON2_DE_PRUEBA);
    const hasherQueImprime = {
      ...real,
      hash: (password: string) => {
        process.stdout.write(`hasheando ${password}\n`);
        return real.hash(password);
      },
    };

    const todo = await altaCapturada(CORREOS[1] ?? '', contrasena, hasherQueImprime);

    expect(todo).toContain(contrasena);
  });
});
