import type { IdentityService } from '../../patients/identity.service.js';
import type { PatientIdentityReader } from '../ports.js';

/**
 * Lector de identidad de la desidentificación (RN-10, RN-11): la identidad cifrada se descifra de PostgreSQL con
 * `IdentityService` y solo vive en memoria, durante el enmascarado. Sin identidad registrada devuelve `null` y el
 * detector aplica solo los formatos configurados. Un error al descifrar NO se traga: se propaga y la desidentificación
 * falla cerrada (AC-7).
 */
export function crearLectorDeIdentidad(
  identidad: Pick<IdentityService, 'descifrar'>,
): PatientIdentityReader {
  return {
    leer: async (patientId) => {
      const descifrada = await identidad.descifrar(patientId);
      if (descifrada === null) return null;
      return {
        nombreCompleto: descifrada.nombreCompleto,
        documento: descifrada.numeroDeDocumento,
      };
    },
  };
}
