import 'server-only';
import { createFollowUp } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import type { FollowUpCreate } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import { zCreateFollowUpPath } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { crearSdkClinicalApi, type SdkClinicalApi } from './clinical-api';
import type { DependenciasDelBff } from './dependencias';
import { verificarOrigen } from './origen';
import { leerCuerpoAcotado } from './peticiones';
import { responderCuerpoExcesivo, retransmitir } from './proxy-json';
import { respuestaPropia } from './respuestas';

const EVENTO_PROXY = 'follow_ups.proxy';

type Manejador = (request: Request, analysisId: string) => Promise<Response>;

/**
 * Proxy transparente de `POST /platform/evidence-analyses/{analysisId}/follow-ups` (US-219, design D2): Origin →
 * `analysisId` UUID (si no, 404 propio sin llamar) → tope de cuerpo → SDK generado → `retransmitir`. Sin validar la
 * pregunta (la del borde es de clinical-api); el log nunca lleva la pregunta ni el id.
 */
export function crearManejadorSeguimiento(dependencias: DependenciasDelBff): Manejador {
  return async (request, analysisId) => {
    const rechazo = verificarOrigen(request, { ...dependencias, evento: EVENTO_PROXY });
    if (rechazo !== null) {
      return rechazo;
    }
    if (!zCreateFollowUpPath.safeParse({ analysisId }).success) {
      return responderAnalisisNoEncontrado(dependencias);
    }

    const cuerpo = await leerCuerpoAcotado(request, dependencias.config.maxBodyBytes);
    if (cuerpo === null) {
      return responderCuerpoExcesivo(dependencias, EVENTO_PROXY);
    }

    const inicio = dependencias.ahora();
    const sdk = crearSdkClinicalApi(dependencias.config, { request, fetch: dependencias.fetch });
    const resultado = await pedirSeguimientoAClinicalApi(sdk, analysisId, cuerpo);
    return retransmitir(dependencias, {
      evento: EVENTO_PROXY,
      sdk,
      respuesta: resultado.response,
      inicio,
    });
  };
}

function responderAnalisisNoEncontrado(dependencias: DependenciasDelBff): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: EVENTO_PROXY, status: 404, traceId });
  return respuestaPropia(
    { error: 'NO_ENCONTRADO', message: 'Análisis no encontrado.', traceId },
    404,
  );
}

function pedirSeguimientoAClinicalApi(sdk: SdkClinicalApi, analysisId: string, cuerpo: string) {
  return createFollowUp({
    client: sdk.client,
    path: { analysisId },
    // Se reenvía tal cual: la validación del borde es de clinical-api (D2).
    body: cuerpo as unknown as FollowUpCreate,
    bodySerializer: (texto) => texto as string,
    parseAs: 'text',
    throwOnError: false,
  });
}
