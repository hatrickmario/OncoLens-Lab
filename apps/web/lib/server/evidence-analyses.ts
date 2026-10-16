import 'server-only';
import { createEvidenceAnalysis } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import type { EvidenceAnalysisRequest } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import type { ConfigWeb } from './config';
import {
  cabecerasHaciaNavegador,
  crearSdkClinicalApi,
  respuestaDeFalloDeTransporte,
  type SdkClinicalApi,
} from './clinical-api';
import { verificarOrigen } from './origen';
import type { Registrar } from './registro';
import { leerCuerpoAcotado, respuestaPropia } from './respuestas';

const EVENTO_PROXY = 'evidence_analyses.proxy';

export interface DependenciasAnalisis {
  config: ConfigWeb;
  fetch: typeof globalThis.fetch;
  nuevoTraceId: () => string;
  ahora: () => number;
  registrar: Registrar;
}

/**
 * Proxy transparente de `POST /platform/evidence-analyses` (design D1): sin validar ni traducir; devuelve
 * el status y el texto exacto de clinical-api con las cabeceras de la lista blanca. Sin streaming ni estado.
 */
export function crearManejadorAnalisis(dependencias: DependenciasAnalisis): (request: Request) => Promise<Response> {
  return async (request) => {
    const rechazo = verificarOrigen(request, { ...dependencias, evento: EVENTO_PROXY });
    if (rechazo !== null) {
      return rechazo;
    }

    const cuerpo = await leerCuerpoAcotado(request, dependencias.config.maxBodyBytes);
    if (cuerpo === null) {
      return responderCuerpoExcesivo(dependencias);
    }

    const inicio = dependencias.ahora();
    const sdk = crearSdkClinicalApi(dependencias.config, { request, fetch: dependencias.fetch });
    const resultado = await pedirAnalisisAClinicalApi(sdk, cuerpo);
    const respuesta = resultado.response;
    const cuerpoCrudo = respuesta === undefined ? undefined : sdk.cuerpoCrudo(respuesta);

    if (respuesta === undefined || cuerpoCrudo === undefined || !esReenviable(respuesta, cuerpoCrudo)) {
      return responderFalloDeTransporte(dependencias, inicio);
    }
    registrarReenvio(dependencias.registrar, respuesta, dependencias.ahora() - inicio);
    return reenviar(respuesta, cuerpoCrudo);
  };
}

function pedirAnalisisAClinicalApi(sdk: SdkClinicalApi, cuerpo: string) {
  return createEvidenceAnalysis({
    client: sdk.client,
    // Se reenvía tal cual: la validación del borde es de clinical-api (D1).
    body: cuerpo as unknown as EvidenceAnalysisRequest,
    bodySerializer: (texto) => texto as string,
    parseAs: 'text',
    throwOnError: false,
  });
}

/** Un error no 2xx que no es JSON (p. ej. HTML de un proxy) no se reenvía: llevaría detalles internos. */
function esReenviable(respuesta: Response, cuerpoCrudo: string): boolean {
  if (respuesta.ok || cuerpoCrudo === '') {
    return true;
  }
  return (respuesta.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json');
}

function reenviar(respuesta: Response, cuerpoCrudo: string): Response {
  const cabeceras = cabecerasHaciaNavegador(respuesta);
  cabeceras.set('Cache-Control', 'no-store');
  return new Response(cuerpoCrudo === '' ? null : cuerpoCrudo, { status: respuesta.status, headers: cabeceras });
}

function responderCuerpoExcesivo(dependencias: DependenciasAnalisis): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: EVENTO_PROXY, status: 413, traceId, motivo: 'cuerpo_excesivo' });
  return respuestaPropia(
    { error: 'CUERPO_INVALIDO', message: 'El cuerpo de la solicitud supera el tamaño permitido.', traceId },
    413,
  );
}

function responderFalloDeTransporte(dependencias: DependenciasAnalisis, inicio: number): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({
    event: EVENTO_PROXY,
    status: 502,
    traceId,
    duracionMs: dependencias.ahora() - inicio,
    motivo: 'clinical_api_inalcanzable',
  });
  return respuestaDeFalloDeTransporte(traceId);
}

function registrarReenvio(registrar: Registrar, respuesta: Response, duracionMs: number): void {
  const traceId = respuesta.headers.get('x-trace-id');
  registrar({
    event: EVENTO_PROXY,
    status: respuesta.status,
    ...(traceId !== null && { traceId }),
    duracionMs,
  });
}
