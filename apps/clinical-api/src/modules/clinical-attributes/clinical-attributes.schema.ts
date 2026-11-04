import type { z } from 'zod';
import { zCreateManualClinicalAttributeBody } from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';
import { leerCuerpoDelContrato, type LecturaDeCuerpo } from '../compartido/cuerpo-de-registro.js';

/**
 * Validación del borde de `POST …/clinical-attributes`: el schema se genera del spec (`strictObject`: un campo ajeno es
 * `CUERPO_INVALIDO`). La pertenencia al catálogo no la expresa el spec: la decide el service (RN-29).
 */
export type CuerpoDeAtributo = z.output<typeof zCreateManualClinicalAttributeBody>;

const CAMPOS_DEL_CONTRATO = Object.keys(zCreateManualClinicalAttributeBody.shape);

export function leerCuerpoDeAtributo(cuerpo: unknown): LecturaDeCuerpo<CuerpoDeAtributo> {
  return leerCuerpoDelContrato(zCreateManualClinicalAttributeBody, CAMPOS_DEL_CONTRATO, cuerpo);
}
