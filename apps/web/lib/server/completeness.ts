import 'server-only';
import { getCompleteness } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import { zGetCompletenessPath } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import type { DependenciasDelBff } from './dependencias';
import { crearProxyDeLectura } from './proxy-de-lectura';

/**
 * Proxy de `GET /platform/patients/{id}/completeness` (US-005). Lectura sin `Origin` (cookie `SameSite=Strict`).
 * RN-26: el aviso de faltantes no bloquea el análisis; un fallo se responde saneado.
 */
export function crearManejadorChecklist(dependencias: DependenciasDelBff) {
  return crearProxyDeLectura(dependencias, {
    evento: 'completeness.proxy',
    mensajeDeFallo: 'No se pudo obtener el checklist del paciente.',
    idValido: (patientId) => zGetCompletenessPath.safeParse({ patientId }).success,
    pedir: (sdk, patientId) =>
      getCompleteness({
        client: sdk.client,
        path: { patientId },
        parseAs: 'text',
        throwOnError: false,
      }),
  });
}
