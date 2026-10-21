import type { IdentityService } from '../../patients/identity.service.js';
import type { PatientIdentityReader } from '../ports.js';

/**
 * Lector de identidad del S1: todavía no hay identidad almacenada (el cifrado y el índice ciego llegan con US-046, S2),
 * así que ningún paciente tiene identidad registrada y el detector aplica solo los formatos configurados. Esto no es un
 * fallo: lanzar sí lo es y la desidentificación falla cerrada (AC-7).
 */
export function crearLectorDeIdentidadDelS1(): PatientIdentityReader {
  return { leer: () => Promise.resolve(null) };
}

/** Esqueleto (US-046 AC-4): por ahora conserva el comportamiento del S1. */
export function crearLectorDeIdentidad(_identidad: Pick<IdentityService, 'descifrar'>): PatientIdentityReader {
  return crearLectorDeIdentidadDelS1();
}
