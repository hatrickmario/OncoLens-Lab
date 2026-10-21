import type { RequestHandler } from 'express';

/** Exige que la sesión tenga alguno de los permisos (semántica de lista del `x-permission`). */
export function authorize(...codigos: string[]): RequestHandler {
  void codigos;
  throw new Error('no implementado');
}

/** Permisos con los que se montó un manejador creado por `authorize`; `undefined` si no lo es. */
export function permisosExigidos(manejador: unknown): readonly string[] | undefined {
  void manejador;
  return undefined;
}
