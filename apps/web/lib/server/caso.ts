import 'server-only';
import { getPatientCase } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import { zGetPatientCasePath } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import type { DependenciasDelBff } from './dependencias';
import { crearProxyDeLectura } from './proxy-de-lectura';

/**
 * Proxy de `GET /platform/patients/{id}/case` (US-090). Sin caché (lo fija `retransmitir`): el caso es dato clínico.
 */
export function crearManejadorVistaDeCaso(dependencias: DependenciasDelBff) {
  return crearProxyDeLectura(dependencias, {
    evento: 'case.proxy',
    mensajeDeFallo: 'No se pudo obtener la vista de caso del paciente.',
    idValido: (patientId) => zGetPatientCasePath.safeParse({ patientId }).success,
    pedir: (sdk, patientId) =>
      getPatientCase({
        client: sdk.client,
        path: { patientId },
        parseAs: 'text',
        throwOnError: false,
      }),
  });
}
