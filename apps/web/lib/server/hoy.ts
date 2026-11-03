import 'server-only';
import { dependenciasDeEntorno, type DependenciasDelBff } from './dependencias';

/**
 * Fecha de hoy (`AAAA-MM-DD`) en UTC desde el reloj inyectado: la base de las fechas relativas (D5). Es la misma
 * definición de «hoy» que usa clinical-api, y no depende de la zona horaria del proceso ni del Compose.
 */
export function hoyDelServidor(
  dependencias: Pick<DependenciasDelBff, 'ahora'> = dependenciasDeEntorno(),
): string {
  return new Date(dependencias.ahora()).toISOString().slice(0, 10);
}
