import type { CaseView } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import { zCaseView } from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';

/**
 * La vista de caso validada con el Zod generado del spec (no se edita a mano): una respuesta fuera de contrato falla
 * cerrada (500), nunca llega al cliente. Como `comoVistaDelChecklist` en `completeness.vista.ts`.
 */
export function comoCaseView(caso: CaseView): CaseView {
  return zCaseView.parse(caso);
}
