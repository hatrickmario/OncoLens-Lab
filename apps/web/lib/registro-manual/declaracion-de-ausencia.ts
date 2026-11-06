import type {
  CaseView,
  ClinicalAttributeManualCreate,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { zClinicalAttributeManualCreate } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { soloElDia } from '../correcciones/cuerpos';
import { mensajes } from '../mensajes';
import type { ErrorDeRegistro } from './errores-del-servidor';

/** Clave del catálogo de atributos con la que se declara «Sin tratamiento previo a la fecha» (RN-29). */
export const CLAVE_DE_DECLARACION = 'sin_tratamiento_previo';

type Atributo = CaseView['attributes'][number];

/** La declaración vigente de ausencia de tratamiento previo entre los atributos de la vista de caso, si existe. */
export function declaracionDeAusencia(atributos: Atributo[]): Atributo | null {
  return atributos.find((a) => a.key === CLAVE_DE_DECLARACION) ?? null;
}

/** Atributos de la vista sin la declaración: esta se muestra en la sección de tratamientos, no como atributo suelto. */
export function sinLaDeclaracion(atributos: Atributo[]): Atributo[] {
  return atributos.filter((a) => a.key !== CLAVE_DE_DECLARACION);
}

/** Cuerpo de `createManualClinicalAttribute` para declarar la ausencia: sin los campos del tratamiento. */
export function cuerpoDeDeclaracion(fecha: string): ClinicalAttributeManualCreate {
  return {
    attributeKey: CLAVE_DE_DECLARACION,
    value: 'si',
    ...(fecha !== '' && { observedAt: fecha }),
  };
}

/** Validación de UX de la declaración: fecha obligatoria y no futura (el servidor decide); `null` si es válida. */
export function errorDeLaDeclaracion(
  cuerpo: ClinicalAttributeManualCreate,
  hoy: string,
): ErrorDeRegistro | null {
  const { errores } = mensajes().caso.registro;
  if (cuerpo.observedAt === undefined) return { campo: 'observedAt', mensaje: errores.obligatorio };
  if (cuerpo.observedAt > soloElDia(hoy)) {
    return { campo: 'observedAt', mensaje: errores.fechaFutura };
  }
  return zClinicalAttributeManualCreate.safeParse(cuerpo).success
    ? null
    : { campo: 'observedAt', mensaje: errores.campoInvalido };
}
