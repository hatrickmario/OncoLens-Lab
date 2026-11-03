import 'server-only';
import type { ClinicalNote } from '../../../../packages/api-contracts/src/types/clinical-api';
import { zListClinicalNotesResponse } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { dependenciasDeEntorno, type DependenciasDelBff } from './dependencias';
import { crearManejadorDeRegistroManual } from './registro-manual';

/**
 * Notas clínicas vigentes de la ficha, leídas en el servidor (RSC) por el mismo manejador que sirve `GET
 * /api/patients/{id}/clinical-notes`. Cualquier fallo es `null`: la ficha se muestra igual y avisa que las notas no se
 * pudieron cargar (RN-26). El contenido de las notas nunca pasa por el log.
 */
export async function leerNotasDeLaFicha(
  cabeceraCookie: string | null,
  id: string,
  dependencias: DependenciasDelBff = dependenciasDeEntorno(),
): Promise<ClinicalNote[] | null> {
  const request = new Request('http://web.interno/', {
    headers: cabeceraCookie === null ? {} : { cookie: cabeceraCookie },
  });
  const respuesta = await crearManejadorDeRegistroManual(dependencias, 'listClinicalNotes')(
    request,
    { id },
  );
  if (respuesta.status !== 200) return null;
  const leido = zListClinicalNotesResponse.safeParse(await respuesta.json().catch(() => null));
  return leido.success ? leido.data.items : null;
}
