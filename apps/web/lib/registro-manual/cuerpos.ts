import type {
  ClinicalAttributeManualCreate,
  PriorTreatmentManualCreate,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import {
  zClinicalAttributeManualCreate,
  zPriorTreatmentManualCreate,
} from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { mensajes } from '../mensajes';
import type { ErrorDeRegistro } from './cliente';

const texto = (datos: FormData, campo: string): string => String(datos.get(campo) ?? '').trim();

/** `{ campo: valor }` si el campo trae algo; lo vacío no se envía. */
const siTrae = (datos: FormData, campo: string): Record<string, string> =>
  texto(datos, campo) === '' ? {} : { [campo]: texto(datos, campo) };

/** Cuerpo de `createManualPriorTreatment`: lo vacío no se envía; en curso no lleva fin ni motivo (contrato). */
export function cuerpoDeTratamiento(datos: FormData): PriorTreatmentManualCreate {
  const enCurso = datos.get('ongoing') === 'on';
  return {
    setting: texto(datos, 'setting') as PriorTreatmentManualCreate['setting'],
    regimenName: texto(datos, 'regimenName'),
    ongoing: enCurso,
    ...(texto(datos, 'lineNumber') !== '' && { lineNumber: Number(texto(datos, 'lineNumber')) }),
    ...siTrae(datos, 'startedAt'),
    ...(!enCurso && { ...siTrae(datos, 'endedAt'), ...siTrae(datos, 'endReason') }),
  };
}

export function cuerpoDeAtributo(datos: FormData): ClinicalAttributeManualCreate {
  return {
    attributeKey: texto(datos, 'attributeKey'),
    value: texto(datos, 'value'),
    ...siTrae(datos, 'observedAt'),
  };
}

const obligatorio = (campo: string): ErrorDeRegistro => ({
  campo,
  mensaje: mensajes().caso.registro.errores.obligatorio,
});

function primerErrorDeZod(resultado: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}): ErrorDeRegistro | null {
  if (resultado.success) return null;
  const campo = resultado.error?.issues[0]?.path[0];
  const mensaje = mensajes().caso.registro.errores.campoInvalido;
  return typeof campo === 'string' ? { campo, mensaje } : { mensaje };
}

/** Validación de UX con el Zod del contrato y la coherencia de fechas y fin; el BFF y clinical-api vuelven a validar. */
export function errorDelCuerpoDeTratamiento(
  cuerpo: PriorTreatmentManualCreate,
): ErrorDeRegistro | null {
  if (cuerpo.regimenName === '') return obligatorio('regimenName');
  if (!cuerpo.ongoing && cuerpo.endReason === undefined) return obligatorio('endReason');
  if (cuerpo.startedAt && cuerpo.endedAt && cuerpo.endedAt < cuerpo.startedAt) {
    return { campo: 'endedAt', mensaje: mensajes().caso.registro.errores.finAnterior };
  }
  return primerErrorDeZod(zPriorTreatmentManualCreate.safeParse(cuerpo));
}

export function errorDelCuerpoDeAtributo(
  cuerpo: ClinicalAttributeManualCreate,
): ErrorDeRegistro | null {
  if (cuerpo.attributeKey === '') return obligatorio('attributeKey');
  if (cuerpo.value === '') return obligatorio('value');
  return primerErrorDeZod(zClinicalAttributeManualCreate.safeParse(cuerpo));
}
