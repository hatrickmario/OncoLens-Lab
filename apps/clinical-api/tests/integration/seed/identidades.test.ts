import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { SeedBloqueadoError } from '../../../prisma/seed/guarda.js';
import { ejecutarSeed } from '../../../prisma/seed/principal.js';
import { componerIdentidad } from '../../../src/modules/patients/identity.module.js';
import { conectar, type BaseDeTest } from '../../support/db.js';
import { entornoDeClaves } from '../../support/identidad.js';
import {
  crearBaseDelSeed,
  entornoDelSeed,
  escribirArchivosDeContrasena,
  seedContraLaBase,
  type ArchivosDeContrasena,
} from '../../support/seed.js';

interface FilaCruda {
  patient_id: string;
  id_type: string;
  national_id_ciphertext: Buffer;
  full_name_ciphertext: Buffer;
  fila_como_texto: string;
}

describe('Identidades cifradas del seed sintético', () => {
  let base: BaseDeTest;
  let cliente: Client;
  let archivos: ArchivosDeContrasena;

  const leerFilas = async () =>
    (
      await cliente.query<FilaCruda>(
        `SELECT patient_id, id_type::text AS id_type, national_id_ciphertext, full_name_ciphertext,
                patient_identity::text AS fila_como_texto
           FROM identity.patient_identity ORDER BY patient_id`,
      )
    ).rows;

  beforeAll(async () => {
    base = await crearBaseDelSeed('identidad');
    cliente = await conectar(base.url);
    archivos = escribirArchivosDeContrasena();
  });

  afterAll(async () => {
    archivos.limpiar();
    await cliente.end();
    await base.destruir();
  });

  it('deja las identidades de los pacientes (a)-(e) cifradas y descifrables, y no las duplica ni las recifra al repetirse [US-046 AC-6]', async () => {
    const entorno = entornoDelSeed(archivos);
    await seedContraLaBase(base.url).ejecutar(entorno);
    const primera = await leerFilas();

    await seedContraLaBase(base.url).ejecutar(entorno);
    const segunda = await leerFilas();

    expect(primera).toHaveLength(5);
    expect(new Set(primera.map((fila) => fila.id_type))).toEqual(new Set(['sintetico']));
    for (const [indice, fila] of primera.entries()) {
      const numero = `SINT-000000${indice + 1}`;
      const nombre = `Prueba Sintética ${indice + 1}`;
      expect(fila.fila_como_texto).not.toContain(numero);
      expect(fila.fila_como_texto).not.toContain(nombre);
      expect(fila.national_id_ciphertext.includes(Buffer.from(numero))).toBe(false);
      expect(fila.full_name_ciphertext.includes(Buffer.from(nombre))).toBe(false);
    }
    const servicio = componerIdentidad({
      env: entornoDeClaves(archivos.claves, 1),
      readFile: (ruta) => readFileSync(ruta, 'utf8'),
      db: cliente,
    });
    const descifradas: (string | undefined)[] = [];
    for (const fila of primera) {
      descifradas.push((await servicio.descifrar(fila.patient_id))?.numeroDeDocumento);
    }
    expect(descifradas.sort()).toEqual([
      'SINT-0000001',
      'SINT-0000002',
      'SINT-0000003',
      'SINT-0000004',
      'SINT-0000005',
    ]);
    expect(segunda).toHaveLength(5);
    for (const [indice, fila] of segunda.entries()) {
      expect(fila.national_id_ciphertext.equals(primera[indice]?.national_id_ciphertext ?? Buffer.alloc(0))).toBe(true);
      expect(fila.full_name_ciphertext.equals(primera[indice]?.full_name_ciphertext ?? Buffer.alloc(0))).toBe(true);
    }
  });

  it('se niega en piloto sin abrir los archivos de clave ni la conexión [US-046 AC-6]', async () => {
    const archivosAbiertos: string[] = [];
    let conexiones = 0;
    const antes = (await leerFilas()).length;

    await expect(
      ejecutarSeed(entornoDelSeed(archivos, { APP_ENV: 'piloto' }), {
        conectar: () => {
          conexiones += 1;
          return Promise.reject(new Error('la guarda debía impedir esta conexión'));
        },
        leerArchivo: (ruta) => {
          archivosAbiertos.push(ruta);
          return 'contenido-ficticio';
        },
        hasher: { hash: () => Promise.resolve('hash'), verify: () => Promise.resolve(false) },
        registrar: () => undefined,
        traceId: 'req_piloto01',
      }),
    ).rejects.toBeInstanceOf(SeedBloqueadoError);

    expect(archivosAbiertos).toEqual([]);
    expect(conexiones).toBe(0);
    expect((await leerFilas()).length).toBe(antes);
  });
});
