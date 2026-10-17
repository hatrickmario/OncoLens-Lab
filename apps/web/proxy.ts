import { NextResponse, type NextRequest } from 'next/server';
import { tieneCookieDeSesion } from './lib/server/sesion';

/** Solo las páginas de pacientes; `/login` y `/api/*` quedan fuera (el BFF responde 401 JSON, no redirige). */
export const config = { matcher: ['/pacientes/:path*'] };

/** Sin cookie, redirige a `/login` sin renderizar nada y sin copiar la ruta del paciente a la URL de destino. */
export function proxy(request: NextRequest) {
  if (tieneCookieDeSesion(request)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL('/login', request.url));
}
