import 'server-only';
import type { NextRequest } from 'next/server';
export const NOMBRE_COOKIE_DE_SESION = 'oncolens_session';

/**
 * Comprobación optimista del guard de páginas (design D8): solo mira que exista la cookie de sesión.
 * La verificación real (sesión conocida y vigente) es el guard de `clinical-api`.
 */
export function tieneCookieDeSesion(request: NextRequest): boolean {
  const valor = request.cookies.get(NOMBRE_COOKIE_DE_SESION)?.value;
  return valor !== undefined && valor !== '';
}
