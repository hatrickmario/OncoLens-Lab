import type { BiomarkerManualCreate } from '../../../../packages/api-contracts/src/types/clinical-api';
import {
  zBiomarker,
  zBiomarkerManualCreate,
} from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { mensajes } from '../mensajes';

const texto = (datos: FormData, campo: string): string => String(datos.get(campo) ?? '').trim();

/** Cuerpo de `createManualBiomarker`: lo vacío no se envía (la unidad es opcional); el nombre viaja en el cuerpo, nunca en la URL. */
export function cuerpoDeBiomarcador(datos: FormData): BiomarkerManualCreate {
  return {
    name: texto(datos, 'name'),
    value: texto(datos, 'value'),
    ...(texto(datos, 'unit') !== '' && { unit: texto(datos, 'unit') }),
    resultType: texto(datos, 'resultType') as BiomarkerManualCreate['resultType'],
    performedAt: texto(datos, 'performedAt'),
  };
}

const OBLIGATORIOS = ['name', 'value', 'resultType', 'performedAt'] as const;

/**
 * Validación de UX por propiedad del cuerpo (las que nombra el `field` del servidor): lo obligatorio vacío y el Zod del
 * contrato. La fecha futura y el término los decide el servidor (D3).
 */
export function erroresDelBiomarcador(cuerpo: BiomarkerManualCreate): Record<string, string> {
  const { obligatorio, campoInvalido } = mensajes().registroManual.errores;
  const errores: Record<string, string> = {};
  for (const campo of OBLIGATORIOS) if (cuerpo[campo] === '') errores[campo] = obligatorio;
  const invalido = zBiomarkerManualCreate.safeParse(cuerpo);
  const campo = invalido.success ? undefined : invalido.error.issues[0]?.path[0];
  if (typeof campo === 'string' && errores[campo] === undefined) errores[campo] = campoInvalido;
  return errores;
}

/** El biomarcador recién creado quedó `no_mapeado` (RN-27): lo decide el servidor, no una predicción del cliente. */
export function biomarcadorSinCodigo(creado: unknown): boolean {
  const leido = zBiomarker.safeParse(creado);
  return leido.success && leido.data.mappingStatus === 'no_mapeado';
}
