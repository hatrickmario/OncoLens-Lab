import 'server-only';
import { randomUUID } from 'node:crypto';
import { leerConfigWeb } from './config';
import type { DependenciasAnalisis } from './evidence-analyses';
import { registrarEnConsola } from './registro';

/** Cableado de producción: configuración de entorno, fetch real, reloj y generador de traceId reales. */
export function dependenciasDeEntorno(): DependenciasAnalisis {
  return {
    config: leerConfigWeb(),
    fetch: globalThis.fetch,
    nuevoTraceId: () => `req_${randomUUID().replaceAll('-', '').slice(0, 8)}`,
    ahora: () => Date.now(),
    registrar: registrarEnConsola,
  };
}
