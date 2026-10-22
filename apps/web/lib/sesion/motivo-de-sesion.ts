export const RUTA_LOGIN_EXPIRADA = '/login?motivo=expirada';
export const RUTA_LOGIN_CERRADA = '/login?motivo=cerrada';

/** Clave de `login.*` del aviso; `motivo` solo admite estos dos valores y nunca se pinta (design D6, S2-01). */
export type ClaveDeAvisoDeSesion = 'sesionExpirada' | 'sesionCerrada';

const CLAVE_POR_MOTIVO: Readonly<Record<string, ClaveDeAvisoDeSesion>> = {
  expirada: 'sesionExpirada',
  cerrada: 'sesionCerrada',
};

/** Cualquier otro valor (otro texto, repetido o ausente) no genera aviso. */
export function claveDeAvisoDeSesion(
  motivo: string | string[] | undefined,
): ClaveDeAvisoDeSesion | null {
  if (typeof motivo !== 'string' || !Object.hasOwn(CLAVE_POR_MOTIVO, motivo)) return null;
  return CLAVE_POR_MOTIVO[motivo] ?? null;
}
