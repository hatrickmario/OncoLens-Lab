import type { RequestHandler } from 'express';
import { PermisoDenegadoError } from '../infrastructure/http-errores.js';

const permisosPorManejador = new WeakMap<object, readonly string[]>();

/**
 * Autorización por PERMISO (no por rol): deja pasar si la sesión tiene alguno de los códigos (semántica de lista del
 * `x-permission` del contrato); si no, 403 `PERMISO_DENEGADO` antes de leer el cuerpo y de cualquier efecto. Cada ruta
 * lo monta con los códigos literales de su `x-permission`; sin sesión (guard mal montado) también rechaza.
 */
export function authorize(...codigos: string[]): RequestHandler {
  const manejador: RequestHandler = (request, _response, next) => {
    const permisos = request.sesion?.permisos;
    if (permisos !== undefined && codigos.some((codigo) => permisos.has(codigo))) {
      next();
      return;
    }
    next(new PermisoDenegadoError());
  };
  permisosPorManejador.set(manejador, codigos);
  return manejador;
}

/** Permisos con los que se montó un manejador creado por `authorize`; `undefined` si no lo es (lo usa el test de coherencia con el contrato). */
export function permisosExigidos(manejador: unknown): readonly string[] | undefined {
  return typeof manejador === 'function' ? permisosPorManejador.get(manejador) : undefined;
}
