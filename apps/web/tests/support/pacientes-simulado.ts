import { delay, http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { ORIGEN_PERMITIDO, URL_CLINICAL_API } from './clinical-api-simulado';

export const URL_LISTADO_DE_PACIENTES = `${ORIGEN_PERMITIDO}/api/patients`;
export const URL_BUSQUEDA_DE_PACIENTES = `${ORIGEN_PERMITIDO}/api/patients/search`;
const RUTA_DEL_LISTADO = `${URL_CLINICAL_API}/platform/patients`;
const RUTA_DE_LA_BUSQUEDA = `${URL_CLINICAL_API}/platform/patients/search`;

export interface PeticionAPacientes {
  url: string;
  cabeceras: Record<string, string>;
  cuerpo: string;
}

export interface RespuestaDePacientes {
  status: number;
  cuerpo: JsonBodyType;
  cabeceras?: Record<string, string>;
}

/** `GET /platform/patients` y `POST /platform/patients/search` de clinical-api simulados en el borde HTTP (MSW). */
export function crearPacientesSimulado() {
  const servidor = setupServer();
  const peticiones: PeticionAPacientes[] = [];
  const capturar = async (request: Request): Promise<void> => {
    peticiones.push({
      url: request.url,
      cabeceras: Object.fromEntries(request.headers.entries()),
      cuerpo: await request.text(),
    });
  };
  const responder = (respuesta: RespuestaDePacientes) => async (info: { request: Request }) => {
    await capturar(info.request);
    return HttpResponse.json(respuesta.cuerpo, {
      status: respuesta.status,
      headers: respuesta.cabeceras ?? {},
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
    responderListado: (respuesta: RespuestaDePacientes) =>
      servidor.use(http.get(RUTA_DEL_LISTADO, responder(respuesta))),
    responderBusqueda: (respuesta: RespuestaDePacientes) =>
      servidor.use(http.post(RUTA_DE_LA_BUSQUEDA, responder(respuesta))),
    listadoInalcanzable: () =>
      servidor.use(
        http.get(RUTA_DEL_LISTADO, async ({ request }) => {
          await capturar(request);
          return HttpResponse.error();
        }),
      ),
    busquedaSinRespuesta: () =>
      servidor.use(
        http.post(RUTA_DE_LA_BUSQUEDA, async ({ request }) => {
          await capturar(request);
          await delay('infinite');
          return HttpResponse.error();
        }),
      ),
  };
}

export function peticionDeListado(
  cabeceras: Record<string, string>,
  consulta: string = '',
): Request {
  return new Request(`${URL_LISTADO_DE_PACIENTES}${consulta}`, {
    method: 'GET',
    headers: cabeceras,
  });
}

export function peticionDeBusqueda(cabeceras: Record<string, string>, cuerpo: unknown): Request {
  return new Request(URL_BUSQUEDA_DE_PACIENTES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo),
  });
}
