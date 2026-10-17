import { randomBytes, randomUUID } from 'node:crypto';

/** Generador de identificadores inyectable: los services no llaman a `uuid()` ni a `randomUUID()` directamente. */
export type GeneradorDeIds = () => string;

const BYTES_DEL_SEUDONIMO = 12;

/** Identificador de correlación de una ejecución o petición (`req_xxxxxxxx`, formato del contrato). */
export function nuevoTraceId(): string {
  return `req_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

/**
 * Seudónimo del paciente para UNA consulta (`psd_…`, patrón de `pseudoPatientId`, RN-11): aleatorio, sin relación
 * con ningún dato del paciente, de modo que dos consultas del mismo paciente no se pueden enlazar.
 */
export function nuevoSeudonimo(): string {
  return `psd_${randomBytes(BYTES_DEL_SEUDONIMO).toString('hex')}`;
}
