import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { createPasswordHasher } from '../../../src/modules/auth/password-hasher.js';
import { conectar, type BaseDeTest } from '../../support/db.js';
import {
  contarFilasDeTodasLasTablas,
  crearBaseDelSeed,
  entornoDelSeed,
  escribirArchivosDeContrasena,
  seedContraLaBase,
  type ArchivosDeContrasena,
} from '../../support/seed.js';
import { ARGON2_DE_PRUEBA } from '../../support/usuarios.js';

const OTRA_CONTRASENA_DEL_ARCHIVO = 'SINT-otra-contrasena-del-archivo';
const CONTRASENA_DE_LA_VARIABLE = 'SINT-contrasena-de-la-variable';

describe('Contraseñas e idempotencia del seed', () => {
  let base: BaseDeTest;
  let cliente: Client;
  let archivos: ArchivosDeContrasena;

  beforeEach(async () => {
    base = await crearBaseDelSeed('idempotencia');
    cliente = await conectar(base.url);
    archivos = escribirArchivosDeContrasena({
      doctor: OTRA_CONTRASENA_DEL_ARCHIVO,
      admin: OTRA_CONTRASENA_DEL_ARCHIVO,
    });
  });

  afterEach(async () => {
    archivos.limpiar();
    await cliente.end();
    await base.destruir();
  });

  async function hashDe(email: string): Promise<string> {
    const { rows } = await cliente.query<{ password_hash: string }>(
      'SELECT password_hash FROM auth."user" WHERE email = $1',
      [email],
    );
    return rows[0]?.password_hash ?? '';
  }

  it('el archivo de contraseña tiene prioridad sobre la variable directa [US-039 AC-1]', async () => {
    const entorno = entornoDelSeed(archivos, { SEED_DOCTOR_PASSWORD: CONTRASENA_DE_LA_VARIABLE });

    await seedContraLaBase(base.url).ejecutar(entorno);

    const hasher = createPasswordHasher(ARGON2_DE_PRUEBA);
    const hash = await hashDe('doc1@test.local');
    expect(await hasher.verify(hash, OTRA_CONTRASENA_DEL_ARCHIVO)).toBe(true);
    expect(await hasher.verify(hash, CONTRASENA_DE_LA_VARIABLE)).toBe(false);
  });

  it('sin archivo la variable directa sirve de respaldo local [US-039 AC-1]', async () => {
    const entorno = entornoDelSeed(archivos, {
      SEED_DOCTOR_PASSWORD_FILE: undefined,
      SEED_ADMIN_PASSWORD_FILE: undefined,
      SEED_DOCTOR_PASSWORD: CONTRASENA_DE_LA_VARIABLE,
      SEED_ADMIN_PASSWORD: CONTRASENA_DE_LA_VARIABLE,
    });

    await seedContraLaBase(base.url).ejecutar(entorno);

    const hasher = createPasswordHasher(ARGON2_DE_PRUEBA);
    expect(await hasher.verify(await hashDe('doc1@test.local'), CONTRASENA_DE_LA_VARIABLE)).toBe(
      true,
    );
    expect(await hasher.verify(await hashDe('admin@test.local'), CONTRASENA_DE_LA_VARIABLE)).toBe(
      true,
    );
  });

  it.each([
    ['sin archivo ni variable', { SEED_DOCTOR_PASSWORD_FILE: undefined }],
    ['con el archivo vacío', { SEED_DOCTOR_PASSWORD_FILE: '/dev/null' }],
  ])(
    'aborta nombrando SEED_DOCTOR_PASSWORD_FILE y sin escribir cuando falta la contraseña (%s) [US-039 AC-1]',
    async (_escenario, extra) => {
      const antes = await contarFilasDeTodasLasTablas(cliente);

      await expect(
        seedContraLaBase(base.url).ejecutar(entornoDelSeed(archivos, extra)),
      ).rejects.toThrow(/SEED_DOCTOR_PASSWORD_FILE/);

      expect(await contarFilasDeTodasLasTablas(cliente)).toEqual(antes);
    },
  );

  it('no escribe nada cuando la siembra falla a mitad (el hash del segundo usuario lanza) [US-039 AC-3]', async () => {
    let llamadas = 0;
    const hasherQueFallaEnElSegundo = {
      hash: () => {
        llamadas += 1;
        return llamadas === 2
          ? Promise.reject(new Error('fallo simulado del hash'))
          : Promise.resolve('$argon2id$hash-de-prueba');
      },
      verify: () => Promise.resolve(false),
    };
    const antes = await contarFilasDeTodasLasTablas(cliente);

    await expect(
      seedContraLaBase(base.url, hasherQueFallaEnElSegundo).ejecutar(entornoDelSeed(archivos)),
    ).rejects.toThrow('fallo simulado del hash');

    expect(await contarFilasDeTodasLasTablas(cliente)).toEqual(antes);
  });

  it('una segunda ejecución no cambia conteos ni identificadores ni el hash [US-039 AC-3]', async () => {
    const seed = seedContraLaBase(base.url);
    await seed.ejecutar(entornoDelSeed(archivos));
    const conteos = await contarFilasDeTodasLasTablas(cliente);
    const ids = await cliente.query('SELECT id FROM clinical.patient ORDER BY id');
    const idsDiagnosticos = await cliente.query('SELECT id FROM clinical.diagnosis ORDER BY id');
    const hash = await hashDe('doc1@test.local');

    const archivosCambiados = escribirArchivosDeContrasena({
      doctor: 'SINT-cambiada-1',
      admin: 'SINT-cambiada-2',
    });
    try {
      await seed.ejecutar(entornoDelSeed(archivosCambiados));
    } finally {
      archivosCambiados.limpiar();
    }

    expect(await contarFilasDeTodasLasTablas(cliente)).toEqual(conteos);
    expect(conteos['clinical.patient']).toBe(5);
    expect(conteos['auth.user']).toBe(2);
    expect(conteos['identity.patient_identity']).toBe(5); // US-046 AC-6: una identidad cifrada por paciente
    expect((await cliente.query('SELECT id FROM clinical.patient ORDER BY id')).rows).toEqual(
      ids.rows,
    );
    expect((await cliente.query('SELECT id FROM clinical.diagnosis ORDER BY id')).rows).toEqual(
      idsDiagnosticos.rows,
    );
    expect(await hashDe('doc1@test.local')).toBe(hash);
  });
});
