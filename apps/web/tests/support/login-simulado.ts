import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import type { DependenciasLogin } from '../../lib/server/auth-login';
import { CABECERA_IP_DEL_SOCKET, firmarIpDelSocket } from '../../lib/server/cabecera-ip-del-socket';
import type { LineaDeRegistro } from '../../lib/server/registro';
import { ORIGEN_PERMITIDO, URL_CLINICAL_API } from './clinical-api-simulado';

export const IP_DE_PRUEBA = '198.51.100.7';
export const URL_LOGIN = `${ORIGEN_PERMITIDO}/api/auth/login`;
const RUTA_UPSTREAM = `${URL_CLINICAL_API}/platform/auth/login`;

export interface PeticionDeLogin {
  cabeceras: Record<string, string>;
  cuerpo: string;
}

/** `POST /platform/auth/login` de clinical-api simulado en el borde HTTP (MSW), con contador y captura. */
export function crearLoginSimulado() {
  const servidor = setupServer();
  const peticiones: PeticionDeLogin[] = [];
  const registrar = async (request: Request): Promise<void> => {
    peticiones.push({
      cabeceras: Object.fromEntries(request.headers.entries()),
      cuerpo: await request.text(),
    });
  };
  return {
    peticiones,
    iniciar: () => servidor.listen({ onUnhandledFrame: 'error' }),
    detener: () => servidor.close(),
    reiniciar: () => {
      servidor.resetHandlers();
      peticiones.length = 0;
    },
    /** Responde 204 con las cabeceras `Set-Cookie` dadas (varias, como emitiría un proveedor real). */
    aceptar: (cookies: string[]) =>
      servidor.use(
        http.post(RUTA_UPSTREAM, async ({ request }) => {
          await registrar(request);
          const cabeceras = new Headers();
          for (const cookie of cookies) cabeceras.append('Set-Cookie', cookie);
          return new HttpResponse(null, { status: 204, headers: cabeceras });
        }),
      ),
    /** Respuesta con cuerpo de texto y tipo arbitrarios (p. ej. HTML de un proxy intermedio). */
    responderTexto: (status: number, texto: string, contentType: string) =>
      servidor.use(
        http.post(RUTA_UPSTREAM, async ({ request }) => {
          await registrar(request);
          return new HttpResponse(texto, { status, headers: { 'Content-Type': contentType } });
        }),
      ),
    /** Fallo de red (ECONNREFUSED, DNS): el `fetch` rechaza sin respuesta. */
    inalcanzable: () => servidor.use(http.post(RUTA_UPSTREAM, () => HttpResponse.error())),
    rechazar: (status: number, cuerpo: JsonBodyType, cabeceras: Record<string, string> = {}) =>
      servidor.use(
        http.post(RUTA_UPSTREAM, async ({ request }) => {
          await registrar(request);
          return HttpResponse.json(cuerpo, { status, headers: cabeceras });
        }),
      ),
  };
}

export function crearDependenciasDeLogin(sobrescribir: Partial<DependenciasLogin> = {}) {
  const lineas: LineaDeRegistro[] = [];
  const dependencias: DependenciasLogin = {
    config: {
      clinicalApiUrl: URL_CLINICAL_API,
      allowedOrigin: ORIGEN_PERMITIDO,
      upstreamTimeoutMs: 5000,
      maxBodyBytes: 32768,
      homePath: '/pacientes/x/analisis',
    },
    fetch: globalThis.fetch,
    nuevoTraceId: () => 'req_web00001',
    registrar: (linea) => lineas.push(linea),
    ...sobrescribir,
  };
  return { dependencias, lineas };
}

export function peticionDeLogin(
  cabeceras: Record<string, string>,
  cuerpo: string | object,
): Request {
  return new Request(URL_LOGIN, {
    method: 'POST',
    // Lo que escribe el wrapper de instrumentation.ts antes de que Next atienda la petición; `cabeceras` puede pisarlo.
    headers: { [CABECERA_IP_DEL_SOCKET]: firmarIpDelSocket(IP_DE_PRUEBA), ...cabeceras },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });
}

/** Lo que haría Next ante una excepción no capturada del Route Handler: una respuesta 500. */
export async function invocarComoNext(
  manejador: (request: Request) => Promise<Response>,
  request: Request,
): Promise<Response> {
  try {
    return await manejador(request);
  } catch {
    return new Response(null, { status: 500 });
  }
}
