import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { componerIdentidad } from '../../../src/modules/patients/identity.module.js';
import {
  conectar,
  crearBaseDeTest,
  leerConfiguracionArnes,
  type BaseDeTest,
} from '../../support/db.js';
import { filaDePaciente, generadorDeIds, insertar } from '../../support/filas-sinteticas.js';
import {
  FX_T4A_A,
  archivosDeClaves,
  entornoDeClaves,
  leerArchivoDeTest,
  nonceSecuencial,
  type ArchivosDeClaves,
} from '../../support/identidad.js';

describe('Convivencia de versiones de clave de la identidad', () => {
  let base: BaseDeTest;
  let cliente: Client;
  let claves: ArchivosDeClaves;

  beforeAll(async () => {
    base = await crearBaseDeTest(leerConfiguracionArnes(process.env), `ident_versiones_${process.pid}`);
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
    const antiguo = (await insertar(cliente, 'clinical.patient', filaDePaciente(ids)))['id'] as string;
    const nuevo = (await insertar(cliente, 'clinical.patient', filaDePaciente(ids)))['id'] as string;
    const servicioV1 = componerIdentidad({
      env: entornoDeClaves(claves, 1),
      readFile: leerArchivoDeTest,
      db: cliente,
      generarNonce: nonceSecuencial(),
    });
    await servicioV1.guardar({
      patientId: antiguo,
      idType: FX_T4A_A.idType,
      issuingCountry: null,
      numeroDeDocumento: FX_T4A_A.numeroDeDocumento,
      nombreCompleto: FX_T4A_A.nombreCompleto,
    });

    const servicioV2 = componerIdentidad({
      env: entornoDeClaves(claves, 2, [1]),
      readFile: leerArchivoDeTest,
      db: cliente,
      generarNonce: nonceSecuencial(),
    });
    await servicioV2.guardar({
      patientId: nuevo,
      idType: FX_T4A_A.idType,
      issuingCountry: null,
      numeroDeDocumento: FX_T4A_A.numeroDistinto,
      nombreCompleto: 'Prueba Sintética 2',
    });

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
