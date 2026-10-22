import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { ORIGEN_PERMITIDO, URL_CLINICAL_API } from './clinical-api-simulado';

export const URL_LOGOUT = `${ORIGEN_PERMITIDO}/api/auth/logout`;
const RUTA_UPSTREAM = `${URL_CLINICAL_API}/platform/auth/logout`;

export interface PeticionDeLogout {
  cabeceras: Record<string, string>;
}

/** `POST /platform/auth/logout` de clinical-api simulado en el borde HTTP (MSW), con captura de lo recibido. */
export function crearLogoutSimulado() {
  const servidor = setupServer();
  const peticiones: PeticionDeLogout[] = [];
  const capturar = (request: Request): void => {
    peticiones.push({ cabeceras: Object.fromEntries(request.headers.entries()) });
  };
  return {
    peticiones,
    iniciar: () => servidor.listen({ onUnhandledFrame: 'error' }),
    detener: () => servidor.close(),
    reiniciar: () => {
      servidor.resetHandlers();
      peticiones.length = 0;
    },
    /** 204 con las cabeceras `Set-Cookie` dadas (la cookie borrada y, a propósito, otras que no deben salir). */
    aceptar: (cookies: string[]) =>
      servidor.use(
        http.post(RUTA_UPSTREAM, ({ request }) => {
          capturar(request);
          const cabeceras = new Headers();
          for (const cookie of cookies) cabeceras.append('Set-Cookie', cookie);
          return new HttpResponse(null, { status: 204, headers: cabeceras });
        }),
      ),
    rechazar: (status: number, cuerpo: JsonBodyType) =>
      servidor.use(
        http.post(RUTA_UPSTREAM, ({ request }) => {
          capturar(request);
          return HttpResponse.json(cuerpo, { status });
        }),
      ),
    inalcanzable: () => servidor.use(http.post(RUTA_UPSTREAM, () => HttpResponse.error())),
  };
}

export function peticionDeLogout(cabeceras: Record<string, string>): Request {
  return new Request(URL_LOGOUT, { method: 'POST', headers: cabeceras });
}
