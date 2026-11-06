import { NextResponse, type NextRequest } from 'next/server';
import { CABECERA_NONCE } from './lib/csp-nonce';
import { construirCsp, generarNonce, leerModoCsp } from './lib/server/csp';
import { tieneCookieDeSesion } from './lib/server/sesion';

/** Toda la app salvo los estáticos de Next (llevan las cabeceras de `next.config.ts`) y el icono. */
export const config = { matcher: ['/((?!_next/static|_next/image|icon.svg).*)'] };

export interface DependenciasProxy {
  generarNonce: () => string;
  entorno: Record<string, string | undefined>;
}

const ES_RUTA_DE_PACIENTES = /^\/pacientes(\/|$)/;

/** Las páginas de pacientes llevan identidad (aunque enmascarada): ni el navegador ni un intermediario las guardan (RN-10). */
function sinCache(respuesta: NextResponse): NextResponse {
  respuesta.headers.set('Cache-Control', 'no-store');
  return respuesta;
}

/**
 * Crea el proxy con el nonce inyectable (design D3): pone la CSP y `x-nonce` en la request (Next los aplica a sus
 * scripts) y la CSP en la respuesta. En `/pacientes/*` conserva el guard de sesión y `no-store`; sin cookie, redirige
 * a `/login` sin copiar la ruta del paciente a la URL de destino.
 */
export function crearProxy({ generarNonce: nuevoNonce, entorno }: DependenciasProxy) {
  return function proxy(request: NextRequest): NextResponse {
    const esPaciente = ES_RUTA_DE_PACIENTES.test(request.nextUrl.pathname);
    const nonce = nuevoNonce();
    const { nombre, valor } = construirCsp({
      nonce,
      modo: leerModoCsp(entorno),
      desarrollo: entorno['NODE_ENV'] === 'development',
    });

    if (esPaciente && !tieneCookieDeSesion(request)) {
      return sinCache(NextResponse.redirect(new URL('/login', request.url)));
    }
    const cabecerasDeRequest = new Headers(request.headers);
    cabecerasDeRequest.set(CABECERA_NONCE, nonce);
    cabecerasDeRequest.set(nombre, valor);
    const respuesta = NextResponse.next({ request: { headers: cabecerasDeRequest } });
    respuesta.headers.set(nombre, valor);
    return esPaciente ? sinCache(respuesta) : respuesta;
  };
}

export const proxy = crearProxy({ generarNonce, entorno: process.env });
