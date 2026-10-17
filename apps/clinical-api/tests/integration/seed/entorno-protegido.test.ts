import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { conectar, type BaseDeTest } from '../../support/db.js';
import {
  contarFilasDeTodasLasTablas,
  crearBaseDelSeed,
  ejecutarSeedComoProceso,
  entornoDelSeed,
  escribirArchivosDeContrasena,
  type ArchivosDeContrasena,
} from '../../support/seed.js';
import { SeedBloqueadoError } from '../../../prisma/seed/guarda.js';
import { ejecutarSeed } from '../../../prisma/seed/principal.js';

describe('Seed bloqueado fuera de los entornos permitidos', () => {
  let base: BaseDeTest;
  let cliente: Client;
  let archivos: ArchivosDeContrasena;

  beforeAll(async () => {
    base = await crearBaseDelSeed('entorno');
    cliente = await conectar(base.url);
    archivos = escribirArchivosDeContrasena();
  });

  afterAll(async () => {
    archivos.limpiar();
    await cliente.end();
    await base.destruir();
  });

  it.each([
    ['APP_ENV=piloto', { APP_ENV: 'piloto' }, 'piloto'],
    ['APP_ENV ausente', { APP_ENV: undefined }, 'APP_ENV'],
    [
      'piloto aunque esté en SEED_ALLOWED_ENVS',
      { APP_ENV: 'piloto', SEED_ALLOWED_ENVS: 'local,piloto' },
      'piloto',
    ],
    [
      'REAL_ANONYMIZED_ENABLED=true',
      { REAL_ANONYMIZED_ENABLED: 'true' },
      'REAL_ANONYMIZED_ENABLED',
    ],
    [
      'REAL_IDENTIFIED_ENABLED=true',
      { REAL_IDENTIFIED_ENABLED: 'true' },
      'REAL_IDENTIFIED_ENABLED',
    ],
  ])(
    'aborta con código distinto de 0 y ninguna tabla cambia de número de filas cuando %s [US-039 AC-5]',
    async (_escenario, extra, textoEsperado) => {
      const antes = await contarFilasDeTodasLasTablas(cliente);
      const entorno = entornoDelSeed(archivos, extra);

      const resultado = ejecutarSeedComoProceso(
        Object.fromEntries(
          Object.entries(entorno).filter((par): par is [string, string] => par[1] !== undefined),
        ),
      );

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain(textoEsperado);
      expect(resultado.salida).not.toContain('no implementado');
      expect(await contarFilasDeTodasLasTablas(cliente)).toEqual(antes);
    },
  );

  it('no abre la conexión a la base cuando la guarda rechaza el entorno [US-039 AC-5]', async () => {
    let conexionesAbiertas = 0;

    await expect(
      ejecutarSeed(entornoDelSeed(archivos, { APP_ENV: 'piloto' }), {
        conectar: () => {
          conexionesAbiertas += 1;
          return Promise.reject(new Error('la guarda debía impedir esta conexión'));
        },
        leerArchivo: () => 'contenido-ficticio',
        hasher: { hash: () => Promise.resolve('hash'), verify: () => Promise.resolve(false) },
        registrar: () => undefined,
      }),
    ).rejects.toBeInstanceOf(SeedBloqueadoError);

    expect(conexionesAbiertas).toBe(0);
  });
});
