import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { componerIdentidad } from '../../../src/modules/patients/identity.module.js';
import { conectar, type BaseDeTest } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  FX_T4A_A,
  archivosDeClaves,
  crearBaseDeIdentidad,
  entornoDeClaves,
  identidadDeFx,
  insertarPacienteSintetico,
  leerArchivoDeTest,
  nonceSecuencial,
  type ArchivosDeClaves,
} from '../../support/identidad.js';

describe('Convivencia de versiones de clave de la identidad', () => {
  let base: BaseDeTest;
  let cliente: Client;
  let claves: ArchivosDeClaves;

  beforeAll(async () => {
    base = await crearBaseDeIdentidad('versiones');
    cliente = await conectar(base.url);
    claves = archivosDeClaves([1, 2]);
  });

  afterAll(async () => {
    claves.limpiar();
    await cliente.end();
    await base.destruir();
  });

  it('descifra una identidad v1 y una v2 nueva cuando IDENTITY_KEY_VERSION es 2 [US-046 AC-5]', async () => {
    const ids = generadorDeIds(11);
    const antiguo = await insertarPacienteSintetico(cliente, ids);
    const nuevo = await insertarPacienteSintetico(cliente, ids);
    const servicioV1 = componerIdentidad({
      env: entornoDeClaves(claves, 1),
      readFile: leerArchivoDeTest,
      db: cliente,
      generarNonce: nonceSecuencial(),
    });
    await servicioV1.guardar(identidadDeFx(antiguo));

    const servicioV2 = componerIdentidad({
      env: entornoDeClaves(claves, 2, [1]),
      readFile: leerArchivoDeTest,
      db: cliente,
      generarNonce: nonceSecuencial(),
    });
    await servicioV2.guardar(
      identidadDeFx(nuevo, {
        numeroDeDocumento: FX_T4A_A.numeroDistinto,
        nombreCompleto: 'Prueba Sintética 2',
      }),
    );

    expect(await servicioV2.descifrar(antiguo)).toMatchObject({
      keyVersion: 1,
      numeroDeDocumento: FX_T4A_A.numeroDeDocumento,
      nombreCompleto: FX_T4A_A.nombreCompleto,
    });
    expect(await servicioV2.descifrar(nuevo)).toMatchObject({
      keyVersion: 2,
      numeroDeDocumento: FX_T4A_A.numeroDistinto,
      nombreCompleto: 'Prueba Sintética 2',
    });
  });
});
