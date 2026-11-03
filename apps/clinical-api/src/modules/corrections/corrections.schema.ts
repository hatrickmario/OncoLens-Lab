import type { z } from 'zod';
import type {
  zCorrectBiomarkerBody,
  zCorrectClinicalNoteBody,
} from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';

/**
 * Validación del borde de `POST …/corrections`: los schemas se generan del spec (`strictObject`). Aquí solo se añade lo
 * que el spec no expresa: `minProperties: 1` de la corrección de nota y el NOMBRE del campo que falló (nunca su valor).
 */
export type CuerpoDeCorreccionDeBiomarcador = z.output<typeof zCorrectBiomarkerBody>;
export type CuerpoDeCorreccionDeNota = z.output<typeof zCorrectClinicalNoteBody>;

export type LecturaDeCuerpo<C> =
  | { readonly valido: true; readonly cuerpo: C }
  | { readonly valido: false; readonly campo?: string };

export function leerCorreccionDeBiomarcador(
  _cuerpo: unknown,
): LecturaDeCuerpo<CuerpoDeCorreccionDeBiomarcador> {
  throw new Error('no implementado');
}

export function leerCorreccionDeNota(_cuerpo: unknown): LecturaDeCuerpo<CuerpoDeCorreccionDeNota> {
  throw new Error('no implementado');
}
