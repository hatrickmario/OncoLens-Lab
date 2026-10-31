import type { PatientIdentityReader } from '../ports.js';

/** Lo único que el lector pide a la identidad: descifrar por paciente (lo cumple `IdentityService` de `patients`). */
export interface FuenteDeIdentidad {
  descifrar(
    patientId: string,
  ): Promise<{ readonly nombreCompleto: string; readonly numeroDeDocumento: string } | null>;
}

/**
 * Lector de identidad de la desidentificación (RN-10, RN-11): la identidad cifrada se descifra de PostgreSQL con
 * `IdentityService` y solo vive en memoria, durante el enmascarado. Sin identidad registrada devuelve `null` y el
 * detector aplica solo los formatos configurados. Un error al descifrar NO se traga: se propaga y la desidentificación
 * falla cerrada (AC-7).
 */
export function crearLectorDeIdentidad(identidad: FuenteDeIdentidad): PatientIdentityReader {
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
