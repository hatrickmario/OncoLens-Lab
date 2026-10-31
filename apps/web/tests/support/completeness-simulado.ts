import { delay, http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { ORIGEN_PERMITIDO, URL_CLINICAL_API } from './clinical-api-simulado';

export const ID_DE_PACIENTE_SINTETICO = '0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10';
export const URL_CHECKLIST = `${ORIGEN_PERMITIDO}/api/patients/${ID_DE_PACIENTE_SINTETICO}/completeness`;
const RUTA_UPSTREAM = `${URL_CLINICAL_API}/platform/patients/${ID_DE_PACIENTE_SINTETICO}/completeness`;

export interface PeticionAlChecklist {
  url: string;
  cabeceras: Record<string, string>;
}

export interface RespuestaDelChecklist {
  status: number;
  cuerpo: JsonBodyType;
  cabeceras?: Record<string, string>;
}

/** `GET /platform/patients/{id}/completeness` de clinical-api simulado en el borde HTTP (MSW). */
export function crearChecklistSimulado() {
  const servidor = setupServer();
  const peticiones: PeticionAlChecklist[] = [];
  const capturar = (request: Request): void => {
    peticiones.push({
      url: request.url,
      cabeceras: Object.fromEntries(request.headers.entries()),
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
    responder: ({ status, cuerpo, cabeceras }: RespuestaDelChecklist) =>
      servidor.use(
        http.get(RUTA_UPSTREAM, ({ request }) => {
          capturar(request);
          return HttpResponse.json(cuerpo, { status, headers: cabeceras ?? {} });
        }),
      ),
    inalcanzable: () =>
      servidor.use(
        http.get(RUTA_UPSTREAM, ({ request }) => {
          capturar(request);
          return HttpResponse.error();
        }),
      ),
    sinRespuesta: () =>
      servidor.use(
        http.get(RUTA_UPSTREAM, async ({ request }) => {
          capturar(request);
          await delay('infinite');
          return HttpResponse.error();
        }),
      ),
  };
}

export function peticionDelChecklist(cabeceras: Record<string, string>): Request {
  return new Request(URL_CHECKLIST, { method: 'GET', headers: cabeceras });
}
