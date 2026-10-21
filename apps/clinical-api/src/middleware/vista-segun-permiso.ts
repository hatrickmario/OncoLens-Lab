import type { SesionAutenticada } from '../modules/auth/auth.service.js';

/** Vistas por permiso de una operación con `x-view-by-permission`; `default` es la de menor privilegio. */
export type VistasPorPermiso<T> = { default: T } & Record<string, T>;

const VISTA_POR_DEFECTO = 'default';

/** Elige la vista por PERMISO (nunca por rol): la del primer permiso de la lista que tenga la sesión, o `default`. */
export function vistaSegunPermiso<T>(
  sesion: Pick<SesionAutenticada, 'permisos'>,
  vistas: VistasPorPermiso<T>,
): T {
  const permisoConVista = Object.keys(vistas).find(
    (clave) => clave !== VISTA_POR_DEFECTO && sesion.permisos.has(clave),
  );
  return vistas[permisoConVista ?? VISTA_POR_DEFECTO] as T;
}
