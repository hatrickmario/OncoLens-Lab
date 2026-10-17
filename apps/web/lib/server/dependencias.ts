import 'server-only';
import { randomUUID } from 'node:crypto';
import { leerConfigWeb } from './config';
import { registrarEnConsola, type Registrar } from './registro';
import type { ConfigWeb } from './config';

/** Cableado de producción: configuración de entorno, fetch real, reloj y generador de traceId reales. */
export interface DependenciasDelBff {
  config: ConfigWeb;
  fetch: typeof globalThis.fetch;
  nuevoTraceId: () => string;
  ahora: () => number;
  registrar: Registrar;
}

export function dependenciasDeEntorno(): DependenciasDelBff {
  return {
    config: leerConfigWeb(),
    fetch: globalThis.fetch,
    nuevoTraceId: () => `req_${randomUUID().replaceAll('-', '').slice(0, 8)}`,
    ahora: () => Date.now(),
    registrar: registrarEnConsola,
  };
}
