import { randomUUID } from 'node:crypto';

/** Generador de identificadores inyectable: los services no llaman a `uuid()` ni a `randomUUID()` directamente. */
export type GeneradorDeIds = () => string;

/** Identificador de correlación de una ejecución o petición (`req_xxxxxxxx`, formato del contrato). */
export function nuevoTraceId(): string {
  return `req_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}
