import 'server-only';
import type { Client } from '../../../../packages/api-contracts/src/client/clinical-api/client/index.js';
import type { ConfigWeb } from './config';

export const NOMBRE_COOKIE_DE_SESION = 'oncolens_session';

export interface OpcionesFetchClinicalApi {
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
  /** `oncolens_session=<valor>` ya filtrada; ausente en el login. */
  cookieDeSesion?: string;
}

export function cabeceraCookieDeSesion(_request: Request): string | undefined {
  throw new Error('no implementado');
}

export function cabecerasHaciaClinicalApi(_cookieDeSesion: string | undefined): Headers {
  throw new Error('no implementado');
}

export function cabecerasHaciaNavegador(_respuesta: Response): Headers {
  throw new Error('no implementado');
}

export function crearFetchHaciaClinicalApi(_opciones: OpcionesFetchClinicalApi): typeof globalThis.fetch {
  throw new Error('no implementado');
}

export function crearSdkClinicalApi(
  _config: Pick<ConfigWeb, 'clinicalApiUrl' | 'upstreamTimeoutMs'>,
  _dependencias: { request?: Request; fetch: typeof globalThis.fetch },
): Client {
  throw new Error('no implementado');
}

export function respuestaDeFalloDeTransporte(_traceId: string): Response {
  throw new Error('no implementado');
}
