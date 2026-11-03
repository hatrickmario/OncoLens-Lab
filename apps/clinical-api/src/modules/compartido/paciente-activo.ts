import type { EstadoDelPaciente } from '../patients/patients.repository.js';
import { PacienteEgresadoError } from './errores-de-registro.js';
import { PacienteNoEncontradoError } from './pacientes.errores.js';

/** RN-17: un paciente egresado no admite ningún registro hasta su reactivación; solo `activo` admite. */
export function pacienteAdmiteRegistros(estado: EstadoDelPaciente): boolean {
  return estado === 'activo';
}

/** Lo que las transacciones de escritura clínica comparten: bloquear la fila del paciente y leer su estado. */
export interface PacienteBloqueable {
  /** Bloquea la fila del paciente (serializa las escrituras concurrentes); `null` si no existe. */
  bloquearPaciente(patientId: string): Promise<{ readonly estado: EstadoDelPaciente } | null>;
}

/** Precondición común de toda escritura, ya con el paciente bloqueado: existe (404) y admite registros (RN-17, 422). */
export async function exigirPacienteQueAdmiteRegistros(
  tx: PacienteBloqueable,
  patientId: string,
): Promise<void> {
  const paciente = await tx.bloquearPaciente(patientId);
  if (paciente === null) throw new PacienteNoEncontradoError();
  if (!pacienteAdmiteRegistros(paciente.estado)) throw new PacienteEgresadoError();
}
