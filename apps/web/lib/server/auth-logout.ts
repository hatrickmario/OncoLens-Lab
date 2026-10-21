import 'server-only';
import type { DependenciasDelBff } from './dependencias';

export type DependenciasLogout = Pick<
  DependenciasDelBff,
  'config' | 'fetch' | 'nuevoTraceId' | 'registrar'
>;

/** Esqueleto: el comportamiento llega con el commit `feat(L1D-198)`. */
export function crearManejadorLogout(
  _dependencias: DependenciasLogout,
): (request: Request) => Promise<Response> {
  return () => Promise.reject(new Error('no implementado'));
}
