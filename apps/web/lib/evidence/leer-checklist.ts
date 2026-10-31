import { zCompletenessView } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { lecturaDeLaVista, type LecturaDelChecklist } from './faltantes';

/**
 * `GET /api/patients/{id}/completeness` al mismo origen (el navegador solo habla con web). Valida la respuesta con el
 * schema Zod generado. `401` → sesión; cualquier otro fallo (5xx, 4xx, red, cuerpo inválido) → checklist no disponible,
 * que avisa pero nunca bloquea (RN-26).
 */
export async function leerChecklist(patientId: string): Promise<LecturaDelChecklist> {
  try {
    const respuesta = await fetch(`/api/patients/${encodeURIComponent(patientId)}/completeness`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (respuesta.status === 401) return { tipo: 'sin_sesion' };
    if (!respuesta.ok) return { tipo: 'no_disponible' };
    const vista = zCompletenessView.safeParse(await respuesta.json().catch(() => null));
    return vista.success ? lecturaDeLaVista(vista.data) : { tipo: 'no_disponible' };
  } catch {
    return { tipo: 'no_disponible' };
  }
}
