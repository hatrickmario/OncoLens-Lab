import 'server-only';
import {
  createClient,
  type Client,
} from '../../../../packages/api-contracts/src/client-web/clinical-api/client';
import type { ConfigWeb } from './config';
import { respuestaPropia } from './respuestas';

import { NOMBRE_COOKIE_DE_SESION } from './sesion';

export { NOMBRE_COOKIE_DE_SESION };

export interface OpcionesFetchClinicalApi {
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
  /** `oncolens_session=<valor>` ya filtrada; ausente en el login. */
  cookieDeSesion?: string;
}

/** Extrae solo `oncolens_session=<valor>`: las demás cookies del navegador no salen de web (design D2). */
export function cabeceraCookieDeSesion(request: Request): string | undefined {
  const cookies = request.headers.get('cookie') ?? '';
  for (const par of cookies.split(';')) {
    const [nombre, ...resto] = par.trim().split('=');
    if (nombre === NOMBRE_COOKIE_DE_SESION) {
      return `${NOMBRE_COOKIE_DE_SESION}=${resto.join('=')}`;
    }
  }
  return undefined;
}

/** Lista blanca hacia clinical-api: nunca Origin, Authorization, X-Forwarded-*, X-Trace-Id ni Idempotency-Key del navegador. */
export function cabecerasHaciaClinicalApi(cookieDeSesion: string | undefined): Headers {
  const cabeceras = new Headers({ 'Content-Type': 'application/json' });
  if (cookieDeSesion !== undefined) {
    cabeceras.set('Cookie', cookieDeSesion);
  }
  return cabeceras;
}

const CABECERAS_HACIA_NAVEGADOR = ['content-type', 'retry-after', 'x-trace-id'] as const;

/** Lista blanca hacia el navegador (más `no-store`): nunca Set-Cookie, Location, Server ni cabeceras internas. */
export function cabecerasHaciaNavegador(respuesta: Response): Headers {
  const cabeceras = new Headers({ 'Cache-Control': 'no-store' });
  for (const nombre of CABECERAS_HACIA_NAVEGADOR) {
    const valor = respuesta.headers.get(nombre);
    if (valor !== null) {
      cabeceras.set(nombre, valor);
    }
  }
  return cabeceras;
}

/**
 * `fetch` inyectado en el SDK generado, SOLO para operaciones JSON: impone `Content-Type: application/json`
 * y envía el cuerpo como texto. Reconstruye la petición con la lista blanca de cabeceras, aplica el timeout
 * (WEB_UPSTREAM_TIMEOUT_MS) y no sigue redirecciones. Lo reutiliza el login (sin cookie entrante).
 * El multipart (ingesta de documentos) queda como deuda: necesitará su propia variante.
 */
export function crearFetchJsonHaciaClinicalApi(
  opciones: OpcionesFetchClinicalApi,
): typeof globalThis.fetch {
  return async (entrada, init) => {
    const peticion = entrada instanceof Request ? entrada : new Request(entrada, init);
    const cuerpo = await peticion.text();
    return opciones.fetch(peticion.url, {
      method: peticion.method,
      headers: cabecerasHaciaClinicalApi(opciones.cookieDeSesion),
      ...(cuerpo !== '' && { body: cuerpo }),
      redirect: 'manual',
      signal: AbortSignal.timeout(opciones.timeoutMs),
    });
  };
}

export interface SdkClinicalApi {
  client: Client;
  /** Texto exacto que envió clinical-api (el SDK parsea y reserializaría los cuerpos); `undefined` si no se pudo leer. */
  cuerpoCrudo(respuesta: Response): string | undefined;
}

/** Única forma de llamar a clinical-api desde web: el SDK generado del contrato con el fetch de lista blanca. */
export function crearSdkClinicalApi(
  config: Pick<ConfigWeb, 'clinicalApiUrl' | 'upstreamTimeoutMs'>,
  dependencias: { request?: Request; fetch: typeof globalThis.fetch },
): SdkClinicalApi {
  const cookieDeSesion =
    dependencias.request === undefined ? undefined : cabeceraCookieDeSesion(dependencias.request);
  const client = createClient({
    baseUrl: config.clinicalApiUrl,
    fetch: crearFetchJsonHaciaClinicalApi({
      fetch: dependencias.fetch,
      timeoutMs: config.upstreamTimeoutMs,
      ...(cookieDeSesion !== undefined && { cookieDeSesion }),
    }),
  });
  const crudos = new WeakMap<Response, string>();
  client.interceptors.response.use(async (respuesta) => {
    crudos.set(respuesta, await respuesta.clone().text());
    return respuesta;
  });
  return { client, cuerpoCrudo: (respuesta) => crudos.get(respuesta) };
}

/** 502 propio del BFF (ErrorServicioIa del contrato): sin URL interna, sin mensaje del error de red. */
export function respuestaDeFalloDeTransporte(traceId: string): Response {
  return respuestaPropia(
    {
      error: 'ERROR_SERVICIO_IA',
      message: 'El servicio de IA no respondió correctamente.',
      traceId,
    },
    502,
  );
}
