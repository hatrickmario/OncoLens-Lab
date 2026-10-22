import { NextResponse, type NextRequest } from 'next/server';
import { tieneCookieDeSesion } from './lib/server/sesion';

/** Solo las páginas de pacientes; `/login` y `/api/*` quedan fuera (el BFF responde 401 JSON, no redirige). */
export const config = { matcher: ['/pacientes/:path*'] };

/** Las páginas de pacientes llevan identidad (aunque enmascarada): ni el navegador ni un intermediario las guardan (RN-10). */
function sinCache(respuesta: NextResponse): NextResponse {
  respuesta.headers.set('Cache-Control', 'no-store');
  return respuesta;
}

/** Sin cookie, redirige a `/login` sin renderizar nada y sin copiar la ruta del paciente a la URL de destino. */
export function proxy(request: NextRequest) {
  if (tieneCookieDeSesion(request)) {
    return sinCache(NextResponse.next());
  }
  return NextResponse.redirect(new URL('/login', request.url));
}
