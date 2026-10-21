import type { SesionAutenticada } from '../modules/auth/auth.service.js';

/** Vistas por permiso de una operación con `x-view-by-permission`; `default` es la de menor privilegio. */
export type VistasPorPermiso<T> = { default: T } & Record<string, T>;

/** Elige la vista por PERMISO (nunca por rol): la del primer permiso de la lista que tenga la sesión, o `default`. */
export function vistaSegunPermiso<T>(
  sesion: Pick<SesionAutenticada, 'permisos'>,
  vistas: VistasPorPermiso<T>,
): T {
  void sesion;
  void vistas;
  throw new Error('no implementado');
}
