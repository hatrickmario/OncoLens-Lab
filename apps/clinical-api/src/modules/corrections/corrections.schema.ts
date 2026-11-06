import type { z } from 'zod';
import { cuerpoInvalido, leerCuerpoDelContrato } from '../compartido/cuerpo-de-registro.js';
import { campoIncoherenteDelFin } from '../prior-treatments/prior-treatments.reglas.js';
import {
  zCorrectBiomarkerBody,
  zCorrectClinicalAttributeBody,
  zCorrectClinicalNoteBody,
  zCorrectPriorTreatmentBody,
} from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';

/**
 * Validación del borde de `POST …/corrections`: los schemas se generan del spec (`strictObject`). Aquí solo se añade lo
 * que el spec no expresa: `minProperties: 1` de la corrección de nota y el NOMBRE del campo que falló (nunca su valor).
 */
export type CuerpoDeCorreccionDeBiomarcador = z.output<typeof zCorrectBiomarkerBody>;
export type CuerpoDeCorreccionDeNota = z.output<typeof zCorrectClinicalNoteBody>;
export type CuerpoDeCorreccionDeTratamiento = z.output<typeof zCorrectPriorTreatmentBody>;
export type CuerpoDeCorreccionDeAtributo = z.output<typeof zCorrectClinicalAttributeBody>;

export type LecturaDeCuerpo<C> =
  | { readonly valido: true; readonly cuerpo: C }
  | { readonly valido: false; readonly campo?: string };

/** El nombre de la propiedad que falló; ausente si el fallo no es de un campo (p. ej. una clave desconocida). */
function campoDelFallo(error: z.ZodError): string | undefined {
  const propiedad = error.issues[0]?.path[0];
  return typeof propiedad === 'string' ? propiedad : undefined;
}

function leer<C extends object>(
  esquema: z.ZodType<C>,
  cuerpo: unknown,
  exigirAlgunaPropiedad = false,
): LecturaDeCuerpo<C> {
  const leido = esquema.safeParse(cuerpo);
  if (!leido.success) {
    const campo = campoDelFallo(leido.error);
    return campo === undefined ? { valido: false } : { valido: false, campo };
  }
  if (exigirAlgunaPropiedad && Object.keys(leido.data).length === 0) return { valido: false };
  return { valido: true, cuerpo: leido.data };
}

export function leerCorreccionDeBiomarcador(
  cuerpo: unknown,
): LecturaDeCuerpo<CuerpoDeCorreccionDeBiomarcador> {
  return leer(zCorrectBiomarkerBody, cuerpo);
}

/** `minProperties: 1`: una corrección de nota sin `content` ni `noteType` no corrige nada. */
export function leerCorreccionDeNota(cuerpo: unknown): LecturaDeCuerpo<CuerpoDeCorreccionDeNota> {
  return leer(zCorrectClinicalNoteBody, cuerpo, true);
}

const CAMPOS_DEL_TRATAMIENTO = Object.keys(zCorrectPriorTreatmentBody.shape);
const CAMPOS_DEL_ATRIBUTO = Object.keys(zCorrectClinicalAttributeBody.shape);

/** Reemplazo completo del alta: el schema generado más la coherencia de `ongoing`, las fechas y el motivo de fin. */
export function leerCorreccionDeTratamiento(
  cuerpo: unknown,
): LecturaDeCuerpo<CuerpoDeCorreccionDeTratamiento> {
  const lectura = leerCuerpoDelContrato(zCorrectPriorTreatmentBody, CAMPOS_DEL_TRATAMIENTO, cuerpo);
  if (!lectura.valido) return lectura;
  const incoherente = campoIncoherenteDelFin(lectura.cuerpo);
  return incoherente === undefined ? lectura : cuerpoInvalido(incoherente);
}

/** `strictObject`: la clave del atributo es inmutable, así que `attributeKey` es una propiedad ajena (422 sin `field`). */
export function leerCorreccionDeAtributo(
  cuerpo: unknown,
): LecturaDeCuerpo<CuerpoDeCorreccionDeAtributo> {
  return leerCuerpoDelContrato(zCorrectClinicalAttributeBody, CAMPOS_DEL_ATRIBUTO, cuerpo);
}
