/** Códigos de error que tienen mensaje propio (o estado propio); cualquier otro `error` de la respuesta se descarta. */
export const CODIGOS_CON_MENSAJE_PROPIO = [
  'TIPO_CANCER_NO_REGISTRADO',
  'LLM_OUTPUT_INVALID',
] as const;

export type CodigoConMensajePropio = (typeof CODIGOS_CON_MENSAJE_PROPIO)[number];

export function esCodigoConMensajePropio(codigo: unknown): codigo is CodigoConMensajePropio {
  return CODIGOS_CON_MENSAJE_PROPIO.some((conocido) => conocido === codigo);
}

/** `422 TIPO_CANCER_NO_REGISTRADO` no es un error técnico: el análisis no se realizó (`[S1 resp. 35]`). */
export function clasificarFallo(
  httpStatus: number,
  codigo: CodigoConMensajePropio | null,
): 'no_realizado' | 'error' {
  return httpStatus === 422 && codigo === 'TIPO_CANCER_NO_REGISTRADO' ? 'no_realizado' : 'error';
}

/**
 * Clave del mensaje de un error de transporte; nunca se muestra el `message` de la respuesta. Un `503 LLM_OUTPUT_INVALID`
 * (el modelo respondió, pero su salida no se pudo validar) no es «modelo no disponible» (US-245, Q1).
 */
export function mensajeDeError(
  httpStatus: number,
  codigo: CodigoConMensajePropio | null = null,
): string {
  if (httpStatus === 503 && codigo === 'LLM_OUTPUT_INVALID')
    return 'evidence.error.salidaNoValidada';
  if (httpStatus === 503) return 'evidence.error.modeloNoDisponible';
  if (httpStatus === 504) return 'evidence.error.tiempoAgotado';
  return 'evidence.error.generico';
}
