import 'server-only';

/** Configuración de servidor de `web` (RN-22): nada de esto lleva prefijo NEXT_PUBLIC_ ni llega al navegador. */
export interface ConfigWeb {
  /** URL interna de clinical-api (red `clinical-net`). */
  clinicalApiUrl: string;
  /** Único origen permitido para peticiones que mutan (SEG-01); comparación exacta. */
  allowedOrigin: string;
  /** Espera máxima a clinical-api; mayor que el deadline de clinical-api hacia rag-orchestrator. */
  upstreamTimeoutMs: number;
  /** Tope del cuerpo de las peticiones al BFF (RN-22); más allá, 413. */
  maxBodyBytes: number;
}

/** Valor por defecto de WEB_MAX_BODY_BYTES: holgado para una pregunta de 2000 caracteres y sus filtros. */
const MAX_BODY_BYTES_POR_DEFECTO = 32768;

export function leerConfigWeb(entorno: Record<string, string | undefined> = process.env): ConfigWeb {
  const clinicalApiUrl = exigir(entorno, 'CLINICAL_API_URL');
  const allowedOrigin = exigir(entorno, 'WEB_ALLOWED_ORIGIN');
  const upstreamTimeoutMs = Number(exigir(entorno, 'WEB_UPSTREAM_TIMEOUT_MS'));
  if (!Number.isInteger(upstreamTimeoutMs) || upstreamTimeoutMs <= 0) {
    throw new Error('WEB_UPSTREAM_TIMEOUT_MS debe ser un entero positivo de milisegundos');
  }
  const maxBodyBytes = Number(entorno['WEB_MAX_BODY_BYTES'] ?? MAX_BODY_BYTES_POR_DEFECTO);
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new Error('WEB_MAX_BODY_BYTES debe ser un entero positivo de bytes');
  }
  return { clinicalApiUrl, allowedOrigin, upstreamTimeoutMs, maxBodyBytes };
}

function exigir(entorno: Record<string, string | undefined>, nombre: string): string {
  const valor = entorno[nombre];
  if (valor === undefined || valor === '') {
    throw new Error(`Falta la variable de entorno ${nombre}`);
  }
  return valor;
}
