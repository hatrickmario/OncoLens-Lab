import 'server-only';
import { NOMBRE_COOKIE_DE_SESION, type MotivoDeFalloDeTransporte } from './clinical-api';
import type { DependenciasDelBff } from './dependencias';
import type { LineaDeRegistro } from './registro';
import { respuestaPropia } from './respuestas';

/** Piezas comunes de los Route Handlers de autenticación (login y logout): mismo 502, misma regla de cookie. */

export type DependenciasDeAutenticacion = Pick<
  DependenciasDelBff,
  'config' | 'fetch' | 'nuevoTraceId' | 'registrar'
>;

export type MotivoDeFalloDeAutenticacion =
  | MotivoDeFalloDeTransporte
  | Extract<
      NonNullable<LineaDeRegistro['motivo']>,
      'cuerpo_no_conforme' | 'sin_cookie_de_sesion' | 'sin_ip_del_cliente'
    >;

export function analizarJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
}

/** 502 propio de autenticación: mensaje fijo, sin hostname, causa ni cuerpo parcial (ErrorServicioAutenticacion). */
export function responderConFalloDeAutenticacion(
  dependencias: DependenciasDeAutenticacion,
  evento: string,
  traceId: string,
  motivo: MotivoDeFalloDeAutenticacion,
): Response {
  dependencias.registrar({ event: evento, status: 502, traceId, motivo });
  return respuestaPropia(
    {
      error: 'ERROR_SERVICIO_AUTENTICACION',
      message: 'El servicio de autenticación no respondió correctamente.',
      traceId,
    },
    502,
  );
}

/**
 * La única `Set-Cookie` de `oncolens_session` que emitió clinical-api, tal cual (sin `Domain`). Falla cerrado: si a esa
 * cookie le falta HttpOnly, Secure o SameSite=Strict, o lleva `Domain`, no hay cookie que retransmitir. Cualquier otra
 * cookie de clinical-api se descarta.
 */
export function cookieDeSesionSegura(respuesta: Response): string | undefined {
  const cookie = respuesta.headers
    .getSetCookie()
    .find((valor) => valor.startsWith(`${NOMBRE_COOKIE_DE_SESION}=`));
  return cookie !== undefined && cookieEsSegura(cookie) ? cookie : undefined;
}

function cookieEsSegura(cookie: string): boolean {
  const atributos = cookie
    .split(';')
    .slice(1)
    .map((atributo) => atributo.trim().toLowerCase());
  return (
    atributos.includes('httponly') &&
    atributos.includes('secure') &&
    atributos.includes('samesite=strict') &&
    !atributos.some((atributo) => atributo.startsWith('domain'))
  );
}
