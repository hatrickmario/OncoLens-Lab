import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { zCaseView } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';

export type LecturaDeCaso =
  | { tipo: 'ok'; vista: CaseView }
  | { tipo: 'error' }
  | { tipo: 'no_encontrado' }
  | { tipo: 'sin_permiso' }
  | { tipo: 'sin_sesion' };

/**
 * `GET /api/patients/{id}/case` al mismo origen (el navegador solo habla con web). `200` se valida con `zCaseView`
 * (generado); un cuerpo inválido, un 5xx o la red caída son `error` sin datos parciales ni el mensaje del servidor.
 */
export async function leerVistaDeCaso(patientId: string): Promise<LecturaDeCaso> {
  try {
    const respuesta = await fetch(`/api/patients/${encodeURIComponent(patientId)}/case`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (respuesta.status === 401) return { tipo: 'sin_sesion' };
    if (respuesta.status === 403) return { tipo: 'sin_permiso' };
    if (respuesta.status === 404) return { tipo: 'no_encontrado' };
    if (!respuesta.ok) return { tipo: 'error' };
    const vista = zCaseView.safeParse(await respuesta.json().catch(() => null));
    return vista.success ? { tipo: 'ok', vista: vista.data } : { tipo: 'error' };
  } catch {
    return { tipo: 'error' };
  }
}
