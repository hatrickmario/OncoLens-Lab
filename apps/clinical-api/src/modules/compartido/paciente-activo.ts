import type { Consultador } from '../auth/auth.repository.js';
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

/** `SELECT … FOR UPDATE` de la fila del paciente (serializa las escrituras concurrentes): una sola consulta para toda escritura clínica. */
export async function bloquearPaciente(
  db: Consultador,
  patientId: string,
): Promise<{ readonly estado: EstadoDelPaciente } | null> {
  const { rows } = await db.query(
    'SELECT lifecycle_status::text AS estado FROM clinical.patient WHERE id = $1 FOR UPDATE',
    [patientId],
  );
  const fila = rows[0];
  return fila === undefined ? null : { estado: fila['estado'] as EstadoDelPaciente };
}
