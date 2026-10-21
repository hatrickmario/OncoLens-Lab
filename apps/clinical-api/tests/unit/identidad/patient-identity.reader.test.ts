import { describe, expect, it } from 'vitest';
import { IdentityIntegrityError } from '../../../src/infrastructure/crypto/identity-integrity-error.js';
import { crearLectorDeIdentidad } from '../../../src/modules/evidence-analysis/deidentification/patient-identity.reader.js';
import type { IdentidadDescifrada } from '../../../src/modules/patients/identity.service.js';
import { FX_T4A_A } from '../../support/identidad.js';

const PACIENTE = '00000001-0000-4000-8000-000000000001';

const identidadDescifrada: IdentidadDescifrada = {
  patientId: PACIENTE,
  idType: 'cedula_ciudadania',
  issuingCountry: null,
  numeroDeDocumento: FX_T4A_A.numeroDeDocumento,
  nombreCompleto: FX_T4A_A.nombreCompleto,
  keyVersion: 1,
};

describe('crearLectorDeIdentidad', () => {
  it('devuelve nombre y documento descifrados para el detector de PII', async () => {
    const lector = crearLectorDeIdentidad({
      descifrar: () => Promise.resolve(identidadDescifrada),
    });

    expect(await lector.leer(PACIENTE)).toEqual({
      nombreCompleto: FX_T4A_A.nombreCompleto,
      documento: FX_T4A_A.numeroDeDocumento,
    });
  });

  it('devuelve null cuando el paciente no tiene identidad registrada', async () => {
    const lector = crearLectorDeIdentidad({ descifrar: () => Promise.resolve(null) });

    expect(await lector.leer(PACIENTE)).toBeNull();
  });

  it('propaga el error de integridad para que la desidentificación falle cerrada', async () => {
    const lector = crearLectorDeIdentidad({
      descifrar: () => Promise.reject(new IdentityIntegrityError()),
    });

    await expect(lector.leer(PACIENTE)).rejects.toBeInstanceOf(IdentityIntegrityError);
  });
});
