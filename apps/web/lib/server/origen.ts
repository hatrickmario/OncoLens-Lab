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
 * si no coincide o falta, la respuesta propia del BFF `403 PERMISO_DENEGADO`.
 */
export function verificarOrigen(_request: Request, _dependencias: DependenciasOrigen): Response | null {
  throw new Error('no implementado');
}
