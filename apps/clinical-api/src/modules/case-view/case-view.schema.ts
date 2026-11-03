import { zGetPatientCasePath } from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';

/**
 * Parámetros de la ruta de `GET /platform/patients/{patientId}/case`, validados con el Zod generado del spec: el
 * `patientId` es un UUID; cualquier otra cosa es un 404 sin consultar la BD (como la ficha y el checklist).
 */
export const parametrosDeRutaSchema = zGetPatientCasePath;

/** UUID del paciente de la ruta, o `undefined` si los parámetros no cumplen el contrato. */
export function leerIdDePaciente(parametros: unknown): string | undefined {
  const lectura = parametrosDeRutaSchema.safeParse(parametros);
  return lectura.success ? lectura.data.patientId : undefined;
}
