import 'server-only';
import type { ConfigWeb } from './config';
import type { Registrar } from './registro';

export interface DependenciasAnalisis {
  config: ConfigWeb;
  fetch: typeof globalThis.fetch;
  nuevoTraceId: () => string;
  ahora: () => number;
  registrar: Registrar;
}

export function crearManejadorAnalisis(_dependencias: DependenciasAnalisis): (request: Request) => Promise<Response> {
  throw new Error('no implementado');
}
