import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { crearIndiceCiego } from '../../../src/infrastructure/crypto/indice-ciego.js';
import { conectar, type BaseDeTest } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  FX_T4A_A,
  claveDeTest,
  identidadDeFx,
  insertarPacienteSintetico,
  servicioDeIdentidad,
} from '../../support/identidad.js';
import {
  crearBaseDelSeed,
  entornoDelSeed,
  escribirArchivosDeContrasena,
  seedContraLaBase,
  type ArchivosDeContrasena,
} from '../../support/seed.js';

const ESPACIO_DE_IDS = 2025;

describe('Índice ciego del nombre (full_name_hmac)', () => {
  let base: BaseDeTest;
  let cliente: Client;
  let archivos: ArchivosDeContrasena;
  const indice = crearIndiceCiego(claveDeTest('hmac'));

  const indicesDelNombre = async () =>
    (
      await cliente.query<{ patient_id: string; full_name_hmac: string | null }>(
        'SELECT patient_id, full_name_hmac FROM identity.patient_identity ORDER BY patient_id',
      )
    ).rows;

  beforeAll(async () => {
    base = await crearBaseDelSeed('nombre_hmac');
    cliente = await conectar(base.url);
    archivos = escribirArchivosDeContrasena();
    await seedContraLaBase(base.url).ejecutar(entornoDelSeed(archivos));
  });

  afterAll(async () => {
    archivos.limpiar();
    await cliente.end();
    await base.destruir();
  });

  it('deja el índice del nombre en las cinco identidades sembradas, calculado del nombre normalizado [US-048 AC-3]', async () => {
    const filas = await indicesDelNombre();

    expect(filas).toHaveLength(5);
    expect(filas.every((fila) => fila.full_name_hmac !== null)).toBe(true);
    const esperados = [1, 2, 3, 4, 5].map((n) => indice.indiceDeNombre(`prueba sintetica ${n}`));
    expect(new Set(filas.map((fila) => fila.full_name_hmac))).toEqual(new Set(esperados));
  });

  it('completa el índice de las filas anteriores a la columna al repetirse el seed y no recifra nada [US-048 AC-3]', async () => {
    const antes = await cliente.query(
      'SELECT patient_id, national_id_ciphertext, full_name_ciphertext FROM identity.patient_identity ORDER BY patient_id',
    );
    await cliente.query('UPDATE identity.patient_identity SET full_name_hmac = NULL');

    await seedContraLaBase(base.url).ejecutar(entornoDelSeed(archivos));

    expect((await indicesDelNombre()).every((fila) => fila.full_name_hmac !== null)).toBe(true);
    const despues = await cliente.query(
      'SELECT patient_id, national_id_ciphertext, full_name_ciphertext FROM identity.patient_identity ORDER BY patient_id',
    );
    expect(despues.rows).toEqual(antes.rows);
  });

  it('acepta dos identidades con el mismo nombre normalizado y documentos distintos [US-048 AC-3]', async () => {
    const ids = generadorDeIds(ESPACIO_DE_IDS);
    const servicio = servicioDeIdentidad(cliente);
    const primero = await insertarPacienteSintetico(cliente, ids);
    const segundo = await insertarPacienteSintetico(cliente, ids);

    await servicio.guardar(identidadDeFx(primero));
    await servicio.guardar(
      identidadDeFx(segundo, {
        numeroDeDocumento: FX_T4A_A.numeroDistinto,
        nombreCompleto: 'LUCIA fernanda  rondon PEÑA',
      }),
    );

    const { rows } = await cliente.query<{ full_name_hmac: string }>(
      'SELECT full_name_hmac FROM identity.patient_identity WHERE patient_id = ANY($1::uuid[])',
      [[primero, segundo]],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.full_name_hmac).toBe(rows[1]?.full_name_hmac);
    expect(rows[0]?.full_name_hmac).toBe(indice.indiceDeNombre(FX_T4A_A.nombreCompleto));
  });
});
