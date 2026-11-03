import type { FollowUpTurn } from '../../../../../packages/api-contracts/src/types/clinical-api';
import {
  zFollowUpCreate,
  zFollowUpTurn,
} from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { ESQUEMA_PREGUNTA_DE_SEGUIMIENTO } from '../reglas-del-formulario';
import { leerError, type ResultadoDeSolicitud } from '../solicitar-analisis';

export type ResultadoDeSeguimiento =
  | { tipo: 'ok'; turno: FollowUpTurn }
  | { tipo: 'limite_alcanzado' }
  | { tipo: 'no_procesable' }
  | Exclude<ResultadoDeSolicitud, { tipo: 'ok' }>;

const CUERPO_DE_SEGUIMIENTO = zFollowUpCreate.extend({
  question: ESQUEMA_PREGUNTA_DE_SEGUIMIENTO,
});

const FALLO_DE_TRANSPORTE = {
  tipo: 'error',
  httpStatus: 0,
  codigo: null,
  traceId: null,
} as const;

/**
 * `POST /api/evidence-analyses/{id}/follow-ups` al mismo origen. El `analysisId` (UUID) va en la ruta y la pregunta
 * solo en el cuerpo, nunca en la URL (RN-10). El `409` es el límite (`LIMITE_SEGUIMIENTO`) y el `422` una pregunta
 * que el servicio no pudo procesar; ninguno muestra código, traza ni `message`.
 */
export async function solicitarSeguimiento(
  analysisId: string,
  question: string,
): Promise<ResultadoDeSeguimiento> {
  const cuerpo = CUERPO_DE_SEGUIMIENTO.safeParse({ question });
  if (!cuerpo.success) return { tipo: 'no_procesable' };
  const id = encodeURIComponent(analysisId);
  try {
    const respuesta = await fetch(`/api/evidence-analyses/${id}/follow-ups`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo.data),
    });
    if (respuesta.status === 401) return { tipo: 'sin_sesion' };
    if (respuesta.status === 409) return { tipo: 'limite_alcanzado' };
    if (respuesta.status === 422) return { tipo: 'no_procesable' };
    if (!respuesta.ok) return await leerError(respuesta);
    const turno = zFollowUpTurn.safeParse(await respuesta.json().catch(() => null));
    return turno.success ? { tipo: 'ok', turno: turno.data } : FALLO_DE_TRANSPORTE;
  } catch {
    return { tipo: 'red' };
  }
}
