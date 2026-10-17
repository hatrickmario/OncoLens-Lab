import 'server-only';
import { createEvidenceAnalysis } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import type { EvidenceAnalysisRequest } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import {
  cabecerasHaciaNavegador,
  clasificarRespuestaDeClinicalApi,
  crearSdkClinicalApi,
  type MotivoDeFalloDeTransporte,
  respuestaDeFalloDeTransporte,
  type SdkClinicalApi,
} from './clinical-api';
import { verificarOrigen } from './origen';
import type { DependenciasDelBff } from './dependencias';
import type { Registrar } from './registro';
import { leerCuerpoAcotado } from './peticiones';
import { respuestaPropia } from './respuestas';

const EVENTO_PROXY = 'evidence_analyses.proxy';

/**
 * Proxy transparente de `POST /platform/evidence-analyses` (design D1): sin validar ni traducir; devuelve
 * el status y el texto exacto de clinical-api con las cabeceras de la lista blanca. Sin streaming ni estado.
 */
export function crearManejadorAnalisis(
  dependencias: DependenciasDelBff,
): (request: Request) => Promise<Response> {
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
    const clasificada = clasificarRespuestaDeClinicalApi(sdk, resultado.response);
    if ('fallo' in clasificada) {
      return responderConFallo(dependencias, inicio, clasificada.fallo, clasificada.respuesta);
    }
    const { respuesta, cuerpoCrudo } = clasificada;
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

function reenviar(respuesta: Response, cuerpoCrudo: string): Response {
  return new Response(cuerpoCrudo === '' ? null : cuerpoCrudo, {
    status: respuesta.status,
    headers: cabecerasHaciaNavegador(respuesta),
  });
}

function responderCuerpoExcesivo(dependencias: DependenciasDelBff): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: EVENTO_PROXY, status: 413, traceId, motivo: 'cuerpo_excesivo' });
  return respuestaPropia(
    {
      error: 'CUERPO_INVALIDO',
      message: 'El cuerpo de la solicitud supera el tamaño permitido.',
      traceId,
    },
    413,
  );
}

function responderConFallo(
  dependencias: DependenciasDelBff,
  inicio: number,
  motivo: MotivoDeFalloDeTransporte,
  respuesta: Response | undefined,
): Response {
  const traceId = dependencias.nuevoTraceId();
  const traceIdClinicalApi = respuesta?.headers.get('x-trace-id') ?? null;
  dependencias.registrar({
    event: EVENTO_PROXY,
    status: 502,
    traceId,
    ...(traceIdClinicalApi !== null && { traceIdClinicalApi }),
    duracionMs: dependencias.ahora() - inicio,
    motivo,
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
