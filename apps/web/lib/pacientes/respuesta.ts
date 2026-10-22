import type { PatientPage } from '../../../../packages/api-contracts/src/types/clinical-api';
import { zPatientPage } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';

/** Resultado de leer el listado o de buscar: lo que la interfaz distingue, sin el detalle del HTTP. */
export type ResultadoDePacientes =
  | { tipo: 'ok'; pagina: PatientPage }
  | { tipo: 'no_autenticado' }
  | { tipo: 'error'; traceId?: string };

export function leerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

export function traceIdDe(cuerpo: unknown, cabecera: string | null): string | undefined {
  const delCuerpo = (cuerpo as { traceId?: unknown } | null)?.traceId;
  if (typeof delCuerpo === 'string') return delCuerpo;
  return cabecera ?? undefined;
}

/**
 * Traduce la respuesta del BFF (`status` y texto exacto): 200 con la página del contrato, 401 como sesión expirada y
 * cualquier otra cosa como error con su `traceId` si lo trae. Un 200 que no cumple el contrato también es un error.
 */
export function interpretarRespuestaDePacientes(
  status: number,
  texto: string,
  cabeceraTraceId: string | null = null,
): ResultadoDePacientes {
  if (status === 401) return { tipo: 'no_autenticado' };
  const cuerpo = leerJson(texto);
  const pagina = status === 200 ? zPatientPage.safeParse(cuerpo) : null;
  if (pagina?.success) return { tipo: 'ok', pagina: pagina.data };
  const traceId = traceIdDe(cuerpo, cabeceraTraceId);
  return { tipo: 'error', ...(traceId !== undefined && { traceId }) };
}
