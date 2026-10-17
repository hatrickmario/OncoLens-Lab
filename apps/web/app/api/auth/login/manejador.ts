import 'server-only';
import type { ConfigWeb } from '../../../../lib/server/config';
import type { LineaDeRegistro } from '../../../../lib/server/registro';

/** `motivo=content_type` es propio del login: el registro compartido solo conoce los motivos del análisis. */
export type LineaDeRegistroLogin = Omit<LineaDeRegistro, 'motivo'> & {
  motivo?: LineaDeRegistro['motivo'] | 'content_type';
};

export interface DependenciasLogin {
  config: ConfigWeb;
  fetch: typeof globalThis.fetch;
  nuevoTraceId: () => string;
  registrar: (linea: LineaDeRegistroLogin) => void;
}

export function crearManejadorLogin(
  dependencias: DependenciasLogin,
): (request: Request) => Promise<Response> {
  void dependencias;
  return () => {
    throw new Error('no implementado');
  };
}
