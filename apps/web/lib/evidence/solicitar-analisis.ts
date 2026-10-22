import type {
  EvidenceAnalysis,
  EvidenceAnalysisRequest,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { zEvidenceAnalysisRefinado } from '../../../../packages/api-contracts/src/zod/clinical-api/refinamientos.gen';
import { zEvidenceAnalysisRequest } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { esCodigoConEstadoPropio, type CodigoConEstadoPropio } from './clasificar-fallo';

export type ResultadoDeSolicitud =
  | { tipo: 'ok'; analisis: EvidenceAnalysis }
  | { tipo: 'sin_sesion' }
  | {
      tipo: 'error';
      httpStatus: number;
      codigo: CodigoConEstadoPropio | null;
      traceId: string | null;
    };

/** Fuentes por defecto del S1: desaparecen con los selectores del S3. */
export const FUENTES_POR_DEFECTO_S1 = { guias: true, ensayos: true, publicaciones: true } as const;

export function armarSolicitud(patientId: string, query: string): EvidenceAnalysisRequest {
  return { patientId, query, sourcesSelected: { ...FUENTES_POR_DEFECTO_S1 } };
}

const FALLO_DE_TRANSPORTE: ResultadoDeSolicitud = {
  tipo: 'error',
  httpStatus: 0,
  codigo: null,
  traceId: null,
};

async function leerError(respuesta: Response): Promise<ResultadoDeSolicitud> {
  const cuerpo: unknown = await respuesta.json().catch(() => null);
  const { error, traceId } = (cuerpo ?? {}) as { error?: unknown; traceId?: unknown };
  return {
    tipo: 'error',
    httpStatus: respuesta.status,
    // El `message` se descarta; `error` solo sirve para elegir el estado, nunca se muestra.
    codigo: esCodigoConEstadoPropio(error) ? error : null,
    traceId: typeof traceId === 'string' ? traceId : null,
  };
}

/**
 * `POST /api/evidence-analyses` al mismo origen (el navegador solo habla con web). Valida el cuerpo y la
 * respuesta con los schemas Zod generados del contrato. Cada llamada es una petición nueva.
 */
export async function solicitarAnalisis(
  solicitud: EvidenceAnalysisRequest,
): Promise<ResultadoDeSolicitud> {
  const cuerpo = zEvidenceAnalysisRequest.safeParse(solicitud);
  if (!cuerpo.success) return FALLO_DE_TRANSPORTE;
  try {
    const respuesta = await fetch('/api/evidence-analyses', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo.data),
    });
    if (respuesta.status === 401) return { tipo: 'sin_sesion' };
    if (!respuesta.ok) return await leerError(respuesta);
    const analisis = zEvidenceAnalysisRefinado.safeParse(await respuesta.json());
    return analisis.success ? { tipo: 'ok', analisis: analisis.data } : FALLO_DE_TRANSPORTE;
  } catch {
    return FALLO_DE_TRANSPORTE;
  }
}
