import 'server-only';
import {
  cabecerasHaciaNavegador,
  clasificarRespuestaDeClinicalApi,
  respuestaDeFalloDeTransporte,
  type SdkClinicalApi,
} from './clinical-api';
import type { DependenciasDelBff } from './dependencias';
import type { Registrar } from './registro';
import { respuestaPropia } from './respuestas';

/**
 * Piezas comunes de los Route Handlers que retransmiten a clinical-api sin traducir (análisis, listado y búsqueda de
 * pacientes): el cuerpo excesivo, el fallo de transporte y el reenvío del status y del texto exacto con la lista blanca
 * de cabeceras. Cada llamador pasa su `evento` de log; el log nunca lleva cuerpo, filtros, cookie ni identidad.
 */

export function responderCuerpoExcesivo(
  dependencias: DependenciasDelBff,
  evento: string,
): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: evento, status: 413, traceId, motivo: 'cuerpo_excesivo' });
  return respuestaPropia(
    {
      error: 'CUERPO_INVALIDO',
      message: 'El cuerpo de la solicitud supera el tamaño permitido.',
      traceId,
    },
    413,
  );
}

/** 422 propio del BFF (`ErrorCuerpoInvalido`): sin eco del valor recibido y sin contactar a clinical-api. */
export function responderCuerpoInvalido(
  dependencias: DependenciasDelBff,
  evento: string,
): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: evento, status: 422, traceId });
  return respuestaPropia(
    {
      error: 'CUERPO_INVALIDO',
      message: 'La solicitud no cumple el contrato.',
      traceId,
    },
    422,
  );
}

function responderConFallo(
  dependencias: DependenciasDelBff,
  evento: string,
  inicio: number,
  motivo: Parameters<Registrar>[0]['motivo'],
  respuesta: Response | undefined,
): Response {
  const traceId = dependencias.nuevoTraceId();
  const traceIdClinicalApi = respuesta?.headers.get('x-trace-id') ?? null;
  dependencias.registrar({
    event: evento,
    status: 502,
    traceId,
    ...(traceIdClinicalApi !== null && { traceIdClinicalApi }),
    duracionMs: dependencias.ahora() - inicio,
    ...(motivo !== undefined && { motivo }),
  });
  return respuestaDeFalloDeTransporte(traceId);
}

function registrarReenvio(
  registrar: Registrar,
  evento: string,
  respuesta: Response,
  duracionMs: number,
): void {
  const traceId = respuesta.headers.get('x-trace-id');
  registrar({
    event: evento,
    status: respuesta.status,
    ...(traceId !== null && { traceId }),
    duracionMs,
  });
}

/**
 * Clasifica la respuesta de clinical-api y la retransmite tal cual (status y texto exacto, cabeceras de la lista
 * blanca más `no-store`); un fallo de transporte es un 502 propio.
 */
export function retransmitir(
  dependencias: DependenciasDelBff,
  entrada: {
    evento: string;
    sdk: SdkClinicalApi;
    respuesta: Response | undefined;
    inicio: number;
  },
): Response {
  const { evento, sdk, respuesta, inicio } = entrada;
  const clasificada = clasificarRespuestaDeClinicalApi(sdk, respuesta);
  if ('fallo' in clasificada) {
    return responderConFallo(
      dependencias,
      evento,
      inicio,
      clasificada.fallo,
      clasificada.respuesta,
    );
  }
  const { respuesta: recibida, cuerpoCrudo } = clasificada;
  registrarReenvio(dependencias.registrar, evento, recibida, dependencias.ahora() - inicio);
  return new Response(cuerpoCrudo === '' ? null : cuerpoCrudo, {
    status: recibida.status,
    headers: cabecerasHaciaNavegador(recibida),
  });
}
