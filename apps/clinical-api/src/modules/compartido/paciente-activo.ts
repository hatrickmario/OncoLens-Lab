import type { EstadoDelPaciente } from '../patients/patients.repository.js';

/** RN-17: un paciente egresado no admite ningún registro hasta su reactivación; solo `activo` admite. */
export function pacienteAdmiteRegistros(estado: EstadoDelPaciente): boolean {
  throw new Error(`no implementado: ${estado}`);
}
