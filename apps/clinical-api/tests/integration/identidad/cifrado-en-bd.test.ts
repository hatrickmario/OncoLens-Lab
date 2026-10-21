import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { zIdType } from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';
import { conectar, type BaseDeTest } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  FX_T4A_A,
  crearBaseDeIdentidad,
  identidadDeFx,
  insertarPacienteSintetico,
  servicioDeIdentidad,
} from '../../support/identidad.js';

describe('Identidad cifrada en PostgreSQL', () => {
  let base: BaseDeTest;
  let cliente: Client;

  beforeAll(async () => {
    base = await crearBaseDeIdentidad('cifrado');
    cliente = await conectar(base.url);
  });

  afterAll(async () => {
    await cliente.end();
    await base.destruir();
  });

  it('el SQL crudo no contiene el documento ni el nombre, key_version es 1 y el servicio descifra los originales [US-046 AC-1]', async () => {
    const patientId = await insertarPacienteSintetico(cliente, generadorDeIds(10));
    const servicio = servicioDeIdentidad(cliente);

    await servicio.guardar(identidadDeFx(patientId));

    const { rows } = await cliente.query<{
      national_id_ciphertext: Buffer;
      full_name_ciphertext: Buffer;
      key_version: number;
      fila_como_texto: string;
    }>(
      `SELECT national_id_ciphertext, full_name_ciphertext, key_version, patient_identity::text AS fila_como_texto
         FROM identity.patient_identity WHERE patient_id = $1`,
      [patientId],
    );
    const fila = rows[0];
    expect(fila).toBeDefined();
    const valoresEnClaro = [FX_T4A_A.numeroDeDocumento, FX_T4A_A.apellido, FX_T4A_A.nombre];
    for (const valor of valoresEnClaro) {
      for (const columna of [fila?.national_id_ciphertext, fila?.full_name_ciphertext]) {
        expect(columna?.includes(Buffer.from(valor, 'utf8'))).toBe(false);
        expect(columna?.toString('hex').includes(Buffer.from(valor, 'utf8').toString('hex'))).toBe(
          false,
        );
      }
      expect(fila?.fila_como_texto.includes(valor)).toBe(false);
    }
    expect(fila?.key_version).toBe(1);
    expect(await servicio.descifrar(patientId)).toMatchObject({
      numeroDeDocumento: FX_T4A_A.numeroDeDocumento,
      nombreCompleto: FX_T4A_A.nombreCompleto,
    });
  });

  it('los valores de identity.id_type en la BD son los mismos de IdType del contrato', async () => {
    const { rows } = await cliente.query<{ valor: string }>(
      'SELECT unnest(enum_range(NULL::identity.id_type))::text AS valor',
    );

    expect(rows.map((fila) => fila.valor).sort()).toEqual([...zIdType.options].sort());
  });
});
