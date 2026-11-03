import 'server-only';
import { dependenciasDeEntorno, type DependenciasDelBff } from './dependencias';

/** Fecha de hoy (`AAAA-MM-DD`, hora local del servidor) desde el reloj inyectado: la base de las fechas relativas (D5). */
export function hoyDelServidor(
  dependencias: Pick<DependenciasDelBff, 'ahora'> = dependenciasDeEntorno(),
): string {
  return new Date(dependencias.ahora()).toLocaleDateString('en-CA');
}
