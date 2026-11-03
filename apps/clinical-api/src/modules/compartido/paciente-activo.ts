import type { EstadoDelPaciente } from '../patients/patients.repository.js';

/** RN-17: un paciente egresado no admite ningún registro hasta su reactivación; solo `activo` admite. */
export function pacienteAdmiteRegistros(estado: EstadoDelPaciente): boolean {
  return estado === 'activo';
}

/** Lo que las transacciones de escritura clínica comparten: bloquear la fila del paciente y leer su estado. */
export interface PacienteBloqueable {
  /** Bloquea la fila del paciente (serializa las escrituras concurrentes); `null` si no existe. */
  bloquearPaciente(patientId: string): Promise<{ readonly estado: EstadoDelPaciente } | null>;
}
