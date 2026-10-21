#!/usr/bin/env node
// CLI `oncolens` (US-045): gestión de usuarios dentro del contenedor de clinical-api, sin ruta HTTP (V-02).
// Raíz de composición del proceso: lee el entorno y los secretos (por archivo) y delega en `ejecutarCli`.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ConfiguracionInvalidaError, readAuthConfig, readDatabaseConfig } from '../config.js';
import { crearPool } from '../infrastructure/database.js';
import { crearRegistrador } from '../infrastructure/logger.js';
import { createPasswordHasher } from '../modules/auth/password-hasher.js';
import { createUsersRepository } from '../modules/users/users.repository.js';
import { createUsersService } from '../modules/users/users.service.js';
import { ejecutarCli, SALIDA_FALLO } from './ejecutar-cli.js';
import { leerContrasenaDe } from './leer-contrasena.js';

const escribirErr = (texto: string): void => {
  process.stderr.write(texto);
};

async function principal(): Promise<number> {
  let configuracion;
  try {
    configuracion = {
      auth: readAuthConfig(process.env),
      database: readDatabaseConfig(process.env, (ruta) => readFileSync(ruta, 'utf8')),
    };
  } catch (error) {
    if (!(error instanceof ConfiguracionInvalidaError)) throw error;
    escribirErr(`configuración inválida: ${error.variable}\n`);
    return SALIDA_FALLO;
  }
  const pool = crearPool(configuracion.database, crearRegistrador(escribirErr));
  // Una sola conexión: las operaciones compuestas (baja + revocación) comparten transacción.
  const conexion = await pool.connect();
  try {
    return await ejecutarCli(
      process.argv.slice(2),
      {
        leerContrasena: () => leerContrasenaDe(process.stdin, escribirErr),
        stdout: (texto) => process.stdout.write(texto),
        stderr: escribirErr,
      },
      {
        users: createUsersService({
          repo: createUsersRepository(conexion),
          hasher: createPasswordHasher(configuracion.auth.argon2),
          reloj: { now: () => new Date() },
          ids: randomUUID,
        }),
        registrar: crearRegistrador((linea) => escribirErr(`${linea}\n`)),
      },
    );
  } finally {
    conexion.release();
    await pool.end();
  }
}

principal().then(
  (codigo) => {
    process.exitCode = codigo;
  },
  () => {
    escribirErr('error interno de la CLI\n');
    process.exitCode = SALIDA_FALLO;
  },
);
