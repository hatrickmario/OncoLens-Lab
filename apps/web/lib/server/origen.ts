import 'server-only';
import type { ConfigWeb } from './config';
import type { Registrar } from './registro';
import { respuestaPropia } from './respuestas';

export interface DependenciasOrigen {
  config: Pick<ConfigWeb, 'allowedOrigin'>;
  nuevoTraceId: () => string;
  registrar: Registrar;
  /** Evento de log del Route Handler que verifica (cada llamador, el suyo: análisis, login...). */
  evento: string;
}

/**
 * SEG-01 (CSRF, además de SameSite=Strict): `null` si el `Origin` coincide exactamente con el permitido;
 * si no coincide o falta, la respuesta propia del BFF `403 PERMISO_DENEGADO`. Se evalúa antes de leer
 * el cuerpo o la cookie. El log no incluye el Origin recibido.
 */
export function verificarOrigen(request: Request, dependencias: DependenciasOrigen): Response | null {
  if (request.headers.get('origin') === dependencias.config.allowedOrigin) {
    return null;
  }
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: dependencias.evento, status: 403, traceId, motivo: 'origen' });
  return respuestaPropia(
    { error: 'PERMISO_DENEGADO', message: 'La solicitud no está permitida desde este origen.', traceId },
    403,
  );
}
