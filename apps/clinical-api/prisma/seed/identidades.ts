import type { IdentidadAGuardar } from '../../src/modules/patients/identity.service.js';

const DIGITOS_DEL_NUMERO = 7;

/**
 * Identidad SINTÉTICA del paciente semilla número `ordinal` (1 = (a)…5 = (e)): `SINT-000000n` y "Prueba Sintética n", los
 * mismos valores de `contracts/examples/patient-summary-doctor.json`. Ninguna es de una persona real (RN-13, RN-14).
 */
export function identidadSinteticaDe(
  patientId: string,
  ordinal: number,
): IdentidadAGuardar {
  return {
    patientId,
    idType: 'sintetico',
    issuingCountry: null,
    numeroDeDocumento: `SINT-${String(ordinal).padStart(DIGITOS_DEL_NUMERO, '0')}`,
    nombreCompleto: `Prueba Sintética ${ordinal}`,
  };
}
