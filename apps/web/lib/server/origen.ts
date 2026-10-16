import 'server-only';
import type { ConfigWeb } from './config';
import type { Registrar } from './registro';

export interface DependenciasOrigen {
  config: Pick<ConfigWeb, 'allowedOrigin'>;
  nuevoTraceId: () => string;
  ahora: () => number;
  registrar: Registrar;
}

/**
 * SEG-01 (CSRF, además de SameSite=Strict): `null` si el `Origin` coincide exactamente con el permitido;
 * si no coincide o falta, la respuesta propia del BFF `403 PERMISO_DENEGADO`. Se evalúa antes de leer
 * el cuerpo o la cookie. El log no incluye el Origin recibido.
 */
export function verificarOrigen(request: Request, dependencias: DependenciasOrigen): Response | null {
  const inicio = dependencias.ahora();
  if (request.headers.get('origin') === dependencias.config.allowedOrigin) {
    return null;
  }
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({
    event: 'evidence_analyses.proxy',
    status: 403,
    traceId,
    duracionMs: dependencias.ahora() - inicio,
    motivo: 'origen',
  });
  return Response.json(
    { error: 'PERMISO_DENEGADO', message: 'La solicitud no está permitida desde este origen.', traceId },
    { status: 403 },
  );
}
