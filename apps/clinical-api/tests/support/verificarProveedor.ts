import type { Express } from 'express';
import type { Test } from 'supertest';

export interface OpcionesDelClienteVerificado {
  /** Rutas de prueba que no existen en el contrato (no se verifican). Cada una se declara por separado. */
  readonly rutasAjenasAlContrato?: readonly string[];
}

export interface ClienteVerificado {
  get(ruta: string): Test;
  post(ruta: string): Test;
  put(ruta: string): Test;
  patch(ruta: string): Test;
  delete(ruta: string): Test;
}

export function clienteVerificado(
  _app: Express,
  _opciones: OpcionesDelClienteVerificado = {},
): ClienteVerificado {
  throw new Error('no implementado');
}
