import 'server-only';
import { createEvidenceAnalysis } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import type { EvidenceAnalysisRequest } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import { crearSdkClinicalApi, type SdkClinicalApi } from './clinical-api';
import { verificarOrigen } from './origen';
import type { DependenciasDelBff } from './dependencias';
import { leerCuerpoAcotado } from './peticiones';
import { responderCuerpoExcesivo, retransmitir } from './proxy-json';

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
      return responderCuerpoExcesivo(dependencias, EVENTO_PROXY);
    }

    const inicio = dependencias.ahora();
    const sdk = crearSdkClinicalApi(dependencias.config, { request, fetch: dependencias.fetch });
    const resultado = await pedirAnalisisAClinicalApi(sdk, cuerpo);
    return retransmitir(dependencias, {
      evento: EVENTO_PROXY,
      sdk,
      respuesta: resultado.response,
      inicio,
    });
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
