import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { SeedBloqueadoError } from '../../../prisma/seed/guarda.js';
import { ejecutarSeed } from '../../../prisma/seed/principal.js';
import { componerIdentidad } from '../../../src/modules/patients/identity.module.js';
import { conectar, type BaseDeTest } from '../../support/db.js';
import { crearIndiceCiego } from '../../../src/infrastructure/crypto/indice-ciego.js';
import { claveDeTest, entornoDeClaves } from '../../support/identidad.js';
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
  national_id_hmac: string;
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
        `SELECT patient_id, id_type::text AS id_type, national_id_ciphertext, national_id_hmac, full_name_ciphertext,
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
    const numeros = [1, 2, 3, 4, 5].map((n) => `SINT-000000${n}`);
    const nombres = [1, 2, 3, 4, 5].map((n) => `Prueba Sintética ${n}`);
    // Ninguna fila contiene ninguno de los 5 números ni de los 5 nombres (no solo el suyo).
    for (const fila of primera) {
      for (const valor of [...numeros, ...nombres]) {
        expect(fila.fila_como_texto).not.toContain(valor);
        expect(fila.national_id_ciphertext.includes(Buffer.from(valor))).toBe(false);
        expect(fila.full_name_ciphertext.includes(Buffer.from(valor))).toBe(false);
      }
    }
    // El generador de nonce de producción (aleatorio) no repite los 12 B iniciales de los 10 blobs.
    const nonces = primera.flatMap((fila) =>
      [fila.national_id_ciphertext, fila.full_name_ciphertext].map((blob) =>
        blob.subarray(0, 12).toString('hex'),
      ),
    );
    expect(nonces).toHaveLength(10);
    expect(new Set(nonces).size).toBe(10);
    const servicio = componerIdentidad({
      env: entornoDeClaves(archivos.claves, 1),
      readFile: (ruta) => readFileSync(ruta, 'utf8'),
      db: cliente,
    });
    const indice = crearIndiceCiego(claveDeTest('hmac'));
    const descifradas: string[] = [];
    for (const fila of primera) {
      const identidad = await servicio.descifrar(fila.patient_id);
      descifradas.push(identidad?.numeroDeDocumento ?? '');
      // El emparejamiento solo se hace con lo descifrado: nombre e índice ciego corresponden al número de su fila.
      const ordinal = Number(identidad?.numeroDeDocumento.slice(-1));
      expect(identidad?.nombreCompleto).toBe(`Prueba Sintética ${ordinal}`);
      expect(fila.national_id_hmac).toBe(
        indice.indiceDeDocumento('sintetico', identidad?.numeroDeDocumento ?? ''),
      );
    }
    expect(descifradas.sort()).toEqual(numeros);
    expect(segunda).toHaveLength(5);
    for (const [indice, fila] of segunda.entries()) {
      expect(
        fila.national_id_ciphertext.equals(
          primera[indice]?.national_id_ciphertext ?? Buffer.alloc(0),
        ),
      ).toBe(true);
      expect(
        fila.full_name_ciphertext.equals(primera[indice]?.full_name_ciphertext ?? Buffer.alloc(0)),
      ).toBe(true);
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
