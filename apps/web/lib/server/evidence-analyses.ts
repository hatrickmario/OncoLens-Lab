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
import { leerCuerpoAcotado } from './peticiones';
import { respuestaPropia } from './respuestas';

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
export function crearManejadorAnalisis(
  dependencias: DependenciasAnalisis,
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
    const respuesta = resultado.response;
    if (respuesta === undefined) {
      return responderConFallo(dependencias, inicio, 'clinical_api_inalcanzable', undefined);
    }
    const cuerpoCrudo = sdk.cuerpoCrudo(respuesta);
    if (cuerpoCrudo === undefined) {
      return responderConFallo(dependencias, inicio, 'cuerpo_cortado', respuesta);
    }
    if (cuerpoCrudo !== '' && !esJson(respuesta)) {
      return responderConFallo(dependencias, inicio, 'error_no_json', respuesta);
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

type MotivoDeFallo = 'clinical_api_inalcanzable' | 'cuerpo_cortado' | 'error_no_json';

/** Compara solo el tipo MIME (sin parámetros como charset): `application/jsonx` no es JSON. */
function esJson(respuesta: Response): boolean {
  const tipo = (respuesta.headers.get('content-type') ?? '').split(';')[0] ?? '';
  return tipo.trim().toLowerCase() === 'application/json';
}

function reenviar(respuesta: Response, cuerpoCrudo: string): Response {
  return new Response(cuerpoCrudo === '' ? null : cuerpoCrudo, {
    status: respuesta.status,
    headers: cabecerasHaciaNavegador(respuesta),
  });
}

function responderCuerpoExcesivo(dependencias: DependenciasAnalisis): Response {
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
  dependencias: DependenciasAnalisis,
  inicio: number,
  motivo: MotivoDeFallo,
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
