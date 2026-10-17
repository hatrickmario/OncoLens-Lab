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
  /** Ruta interna a la que navega el login tras el 204 (design D9); validada contra redirección abierta. */
  homePath: string;
}

/** Valor por defecto de WEB_MAX_BODY_BYTES: holgado para una pregunta de 2000 caracteres y sus filtros. */
const MAX_BODY_BYTES_POR_DEFECTO = 32768;

export function leerConfigWeb(
  entorno: Record<string, string | undefined> = process.env,
): ConfigWeb {
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
  const homePath = leerRutaDeInicio(exigir(entorno, 'WEB_HOME_PATH'));
  return { clinicalApiUrl, allowedOrigin, upstreamTimeoutMs, maxBodyBytes, homePath };
}

function exigir(entorno: Record<string, string | undefined>, nombre: string): string {
  const valor = entorno[nombre];
  if (valor === undefined || valor === '') {
    throw new Error(`Falta la variable de entorno ${nombre}`);
  }
  return valor;
}

/** Solo rutas internas: ni `//otro.sitio`, ni `https://…`, ni caracteres de control que el navegador ignoraría. */
function leerRutaDeInicio(ruta: string): string {
  const interna =
    ruta.startsWith('/') &&
    ![...ruta].some(esControlOBarraInversa) &&
    new URL(ruta, 'http://x').origin === 'http://x' &&
    !ruta.startsWith('//');
  if (!interna) {
    throw new Error('WEB_HOME_PATH debe ser una ruta interna que empiece por una sola "/"');
  }
  return ruta;
}

function esControlOBarraInversa(caracter: string): boolean {
  const codigo = caracter.charCodeAt(0);
  return codigo <= 0x1f || codigo === 0x7f || caracter === '\\';
}
