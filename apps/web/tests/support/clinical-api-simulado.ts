import { readFileSync } from 'node:fs';
import { delay, http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import type { DependenciasDelBff } from '../../lib/server/dependencias';
import type { LineaDeRegistro } from '../../lib/server/registro';

export const URL_CLINICAL_API = 'http://clinical-api.test:3000';
export const ORIGEN_PERMITIDO = 'http://web.test:3000';
export const URL_ANALISIS = `${ORIGEN_PERMITIDO}/api/evidence-analyses`;
const RUTA_UPSTREAM = `${URL_CLINICAL_API}/platform/evidence-analyses`;

/** Los handlers se construyen desde contracts/examples/: un mock no puede divergir del contrato. */
export function ejemplo(nombre: string): Record<string, unknown> {
  const ruta = new URL(`../../../../contracts/examples/${nombre}`, import.meta.url);
  return JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>;
}

export interface PeticionCapturada {
  url: string;
  cabeceras: Record<string, string>;
  cuerpo: string;
}

export interface RespuestaSimulada {
  status: number;
  cuerpo: JsonBodyType;
  cabeceras?: Record<string, string>;
}

/** clinical-api simulado en el borde HTTP saliente (MSW), con contador y captura de lo recibido. */
export function crearClinicalApiSimulado() {
  const servidor = setupServer();
  const peticiones: PeticionCapturada[] = [];

  const capturar = async (request: Request): Promise<void> => {
    peticiones.push({
      url: request.url,
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
    responder: ({ status, cuerpo, cabeceras }: RespuestaSimulada) =>
      servidor.use(
        http.post(RUTA_UPSTREAM, async ({ request }) => {
          await capturar(request);
          return HttpResponse.json(cuerpo, { status, headers: cabeceras ?? {} });
        }),
      ),
    /** Responde con texto crudo (sin pasar por JSON.stringify), para comprobar que no se reserializa. */
    responderTexto: ({
      status,
      texto,
      cabeceras,
    }: {
      status: number;
      texto: string | null;
      cabeceras?: Record<string, string>;
    }) =>
      servidor.use(
        http.post(RUTA_UPSTREAM, async ({ request }) => {
          await capturar(request);
          return new HttpResponse(texto, { status, headers: cabeceras ?? {} });
        }),
      ),
    fallarConErrorDeRed: () =>
      servidor.use(
        http.post(RUTA_UPSTREAM, async ({ request }) => {
          await capturar(request);
          return HttpResponse.error();
        }),
      ),
    noResponder: () =>
      servidor.use(
        http.post(RUTA_UPSTREAM, async ({ request }) => {
          await capturar(request);
          await delay('infinite');
          return HttpResponse.error();
        }),
      ),
  };
}

/** Dependencias del handler con reloj, traceId y logger controlados por el test. */
export function crearDependenciasDeTest(sobrescribir: Partial<DependenciasDelBff> = {}) {
  const lineas: LineaDeRegistro[] = [];
  const dependencias: DependenciasDelBff = {
    config: {
      clinicalApiUrl: URL_CLINICAL_API,
      allowedOrigin: ORIGEN_PERMITIDO,
      upstreamTimeoutMs: 5000,
      maxBodyBytes: 32768,
      homePath: '/pacientes/x/analisis',
    },
    fetch: globalThis.fetch,
    nuevoTraceId: () => 'req_web00001',
    ahora: () => 1_760_000_000_000,
    registrar: (linea) => lineas.push(linea),
    ...sobrescribir,
  };
  return { dependencias, lineas };
}

export function peticionDeAnalisis(
  cabeceras: Record<string, string>,
  cuerpo: unknown = ejemplo('evidence-analysis-request.json'),
): Request {
  return new Request(URL_ANALISIS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo),
  });
}
