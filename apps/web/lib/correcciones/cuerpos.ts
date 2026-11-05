import type {
  BiomarkerCorrection,
  ClinicalNoteCorrection,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import {
  zBiomarkerCorrection,
  zClinicalNoteCorrection,
} from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { mensajes } from '../mensajes';
import type { ErrorDeCorreccion } from './cliente';

/** Día `YYYY-MM-DD` de una fecha del contrato, sin pasar por `Date` (evita el corrimiento por zona horaria). */
export const soloElDia = (fecha: string): string => fecha.slice(0, 10);

const texto = (datos: FormData, campo: string): string => String(datos.get(campo) ?? '').trim();

/** Cuerpo de `correctBiomarker` desde el formulario: lo vacío no se envía; borrar una unidad existente envía `null`. */
export function cuerpoDeCorreccionDeBiomarcador(
  datos: FormData,
  unidadActual: string | null | undefined,
  fechaActual?: string,
): BiomarkerCorrection {
  const unidad = texto(datos, 'unit');
  const fecha = texto(datos, 'performedAt');
  const fechaCambio = fecha !== '' && fecha !== (fechaActual && soloElDia(fechaActual));
  return {
    value: texto(datos, 'value'),
    ...(unidad !== '' ? { unit: unidad } : unidadActual ? { unit: null } : {}),
    ...(fechaCambio && { performedAt: fecha }),
  };
}

/** Cuerpo de `correctClinicalNote`: el tipo y el texto elegidos por el oncólogo, tal cual (sin recortar el contenido). */
export function cuerpoDeCorreccionDeNota(datos: FormData): ClinicalNoteCorrection {
  return {
    noteType: texto(datos, 'noteType') as ClinicalNoteCorrection['noteType'],
    content: String(datos.get('content') ?? ''),
  };
}

function primerErrorDe(
  resultado: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } },
  obligatorio: string,
): ErrorDeCorreccion | null {
  if (resultado.success) return null;
  const campo = resultado.error?.issues[0]?.path[0];
  const { errores } = mensajes().ficha.correccion;
  return {
    ...(typeof campo === 'string' && { campo }),
    mensaje: campo === obligatorio ? errores.obligatorio : errores.campoInvalido,
  };
}

/** Validación de UX con el Zod del contrato; clinical-api y el BFF vuelven a validar. `null` si el cuerpo es válido. */
export function errorDelCuerpoDeBiomarcador(
  cuerpo: BiomarkerCorrection,
  hoy: string,
): ErrorDeCorreccion | null {
  if (cuerpo.performedAt !== undefined && cuerpo.performedAt > soloElDia(hoy)) {
    return { campo: 'performedAt', mensaje: mensajes().ficha.correccion.errores.fechaFutura };
  }
  return primerErrorDe(zBiomarkerCorrection.safeParse(cuerpo), 'value');
}

export function errorDelCuerpoDeNota(cuerpo: ClinicalNoteCorrection): ErrorDeCorreccion | null {
  const vacia = cuerpo.content === undefined || cuerpo.content.trim() === '';
  if (vacia) return { campo: 'content', mensaje: mensajes().ficha.correccion.errores.obligatorio };
  return primerErrorDe(zClinicalNoteCorrection.safeParse(cuerpo), 'content');
}
