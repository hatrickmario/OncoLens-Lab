import 'server-only';
import { createEvidenceAnalysis } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import type { EvidenceAnalysisRequest } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import type { ConfigWeb } from './config';
import {
  cabecerasHaciaNavegador,
  crearSdkClinicalApi,
  respuestaDeFalloDeTransporte,
} from './clinical-api';
import { verificarOrigen } from './origen';
import type { Registrar } from './registro';

export interface DependenciasAnalisis {
  config: ConfigWeb;
  fetch: typeof globalThis.fetch;
  nuevoTraceId: () => string;
  ahora: () => number;
  registrar: Registrar;
}

/**
 * Proxy transparente de `POST /platform/evidence-analyses` (design D1): sin validar ni traducir; devuelve
 * el status y el JSON de clinical-api con las cabeceras de la lista blanca. Sin streaming ni estado.
 */
export function crearManejadorAnalisis(dependencias: DependenciasAnalisis): (request: Request) => Promise<Response> {
  return async (request) => {
    const rechazo = verificarOrigen(request, dependencias);
    if (rechazo !== null) {
      return rechazo;
    }

    const inicio = dependencias.ahora();
    const resultado = await pedirAnalisisAClinicalApi(dependencias, request);

    if (resultado.response === undefined) {
      return responderFalloDeTransporte(dependencias, inicio);
    }
    const respuesta = resultado.response;
    // Con parseAs 'text' el SDK entrega el cuerpo sin parsear aunque su tipo declarado sea EvidenceAnalysis.
    const cuerpoDeRespuesta = respuesta.ok ? (resultado.data as unknown as string) : serializarError(resultado.error);
    registrarReenvio(dependencias.registrar, respuesta, dependencias.ahora() - inicio);
    return new Response(cuerpoDeRespuesta, { status: respuesta.status, headers: cabecerasHaciaNavegador(respuesta) });
  };
}

async function pedirAnalisisAClinicalApi(dependencias: DependenciasAnalisis, request: Request) {
  const cuerpo = await request.text();
  const sdk = crearSdkClinicalApi(dependencias.config, { request, fetch: dependencias.fetch });
  return createEvidenceAnalysis({
    client: sdk,
    // Se reenvía tal cual: la validación del borde es de clinical-api (D1).
    body: cuerpo as unknown as EvidenceAnalysisRequest,
    bodySerializer: (texto) => texto as string,
    parseAs: 'text',
    throwOnError: false,
  });
}

function serializarError(error: unknown): string {
  return typeof error === 'string' ? error : JSON.stringify(error);
}

function responderFalloDeTransporte(dependencias: DependenciasAnalisis, inicio: number): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({
    event: 'evidence_analyses.proxy',
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
    event: 'evidence_analyses.proxy',
    status: respuesta.status,
    ...(traceId !== null && { traceId }),
    duracionMs,
  });
}
