import type { z } from 'zod';

/** Resultado de leer el cuerpo de una escritura: el cuerpo, o el NOMBRE del campo que lo invalida (nunca su valor). */
export type LecturaDeCuerpo<C> =
  | { readonly valido: true; readonly cuerpo: C }
  | { readonly valido: false; readonly campo?: string };

export const cuerpoInvalido = (campo?: string): LecturaDeCuerpo<never> =>
  campo === undefined ? { valido: false } : { valido: false, campo };

/**
 * Lee el cuerpo con el schema Zod generado del spec. Si no cumple, nombra la primera propiedad que falla solo cuando
 * es una del contrato (`camposDelContrato`): un nombre de propiedad ajeno viene del cliente y no se repite (RN-10).
 */
export function leerCuerpoDelContrato<E extends z.ZodType>(
  esquema: E,
  camposDelContrato: readonly string[],
  cuerpo: unknown,
): LecturaDeCuerpo<z.output<E>> {
  const leido = esquema.safeParse(cuerpo);
  if (leido.success) return { valido: true, cuerpo: leido.data };
  const campo = leido.error.issues[0]?.path[0];
  return cuerpoInvalido(
    typeof campo === 'string' && camposDelContrato.includes(campo) ? campo : undefined,
  );
}
