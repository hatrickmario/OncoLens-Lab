import 'server-only';
import { getCompleteness } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import { zGetCompletenessPath } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { crearSdkClinicalApi, type SdkClinicalApi } from './clinical-api';
import type { DependenciasDelBff } from './dependencias';
import { retransmitir } from './proxy-json';
import { respuestaPropia } from './respuestas';

const EVENTO = 'completeness.proxy';

type Manejador = (request: Request, patientId: string) => Promise<Response>;

function responderNoEncontrado(dependencias: DependenciasDelBff): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: EVENTO, status: 404, traceId });
  return respuestaPropia(
    { error: 'NO_ENCONTRADO', message: 'Paciente no encontrado.', traceId },
    404,
  );
}

/**
 * Único 5xx que sale al navegador (US-005 AC-5): código y mensaje fijos y `traceId` propio de web. Nada de lo que
 * envió clinical-api (cuerpo, pila, URL, `X-Trace-Id`) lo atraviesa, ni el log lo registra.
 */
function responderChecklistNoDisponible(
  dependencias: DependenciasDelBff,
  inicio: number,
  motivo: 'status_5xx' | 'fallo_de_red',
): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({
    event: EVENTO,
    status: 500,
    traceId,
    duracionMs: dependencias.ahora() - inicio,
    motivo,
  });
  return respuestaPropia(
    {
      error: 'ERROR_INTERNO',
      message: 'No se pudo obtener el checklist del paciente.',
      traceId,
    },
    500,
  );
}

async function pedirChecklist(
  sdk: SdkClinicalApi,
  patientId: string,
): Promise<Response | undefined> {
  try {
    const resultado = await getCompleteness({
      client: sdk.client,
      path: { patientId },
      parseAs: 'text',
      throwOnError: false,
    });
    return resultado.response;
  } catch {
    return undefined;
  }
}

/**
 * Proxy de `GET /platform/patients/{id}/completeness` (US-005). Lectura sin `Origin` (cookie `SameSite=Strict`). Un id
 * que no es UUID es 404 propio sin llamar. Retransmite solo `200` y `4xx` con `retransmitir`; un `5xx`, un fallo de red
 * o un timeout se interceptan antes y responden `ERROR_INTERNO` saneado (RN-26: el aviso no bloquea el análisis).
 */
export function crearManejadorChecklist(dependencias: DependenciasDelBff): Manejador {
  return async (request, patientId) => {
    if (!zGetCompletenessPath.safeParse({ patientId }).success) {
      return responderNoEncontrado(dependencias);
    }
    const inicio = dependencias.ahora();
    const sdk = crearSdkClinicalApi(dependencias.config, { request, fetch: dependencias.fetch });
    const respuesta = await pedirChecklist(sdk, patientId);
    if (respuesta === undefined) {
      return responderChecklistNoDisponible(dependencias, inicio, 'fallo_de_red');
    }
    if (respuesta.status >= 500) {
      return responderChecklistNoDisponible(dependencias, inicio, 'status_5xx');
    }
    return retransmitir(dependencias, { evento: EVENTO, sdk, respuesta, inicio });
  };
}
