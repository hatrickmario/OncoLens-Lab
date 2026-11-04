import type { ManualEntryOptions } from '../../../../packages/api-contracts/src/types/clinical-api';
import { zManualEntryOptions } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { leerJson } from './cliente';

export type LecturaDeOpciones = { tipo: 'ok'; opciones: ManualEntryOptions } | { tipo: 'error' };

/** `GET …/manual-entry-options` del BFF: valores del catálogo para los formularios (RN-29), validados con el Zod del contrato. */
export async function pedirOpcionesDeRegistro(pacienteId: string): Promise<LecturaDeOpciones> {
  try {
    const respuesta = await fetch(`/api/patients/${pacienteId}/manual-entry-options`, {
      cache: 'no-store',
    });
    const leido = zManualEntryOptions.safeParse(leerJson(await respuesta.text()));
    return respuesta.status === 200 && leido.success
      ? { tipo: 'ok', opciones: leido.data }
      : { tipo: 'error' };
  } catch {
    return { tipo: 'error' };
  }
}
