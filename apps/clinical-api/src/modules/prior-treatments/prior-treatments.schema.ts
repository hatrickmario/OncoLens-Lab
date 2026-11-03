import type { z } from 'zod';
import { zCreateManualPriorTreatmentBody } from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';
import {
  cuerpoInvalido,
  leerCuerpoDelContrato,
  type LecturaDeCuerpo,
} from '../compartido/cuerpo-de-registro.js';
import { campoIncoherenteDelFin } from './prior-treatments.reglas.js';

/**
 * Validación del borde de `POST …/prior-treatments`: el schema se genera del spec (`strictObject`: un campo ajeno es
 * `CUERPO_INVALIDO`). Aquí solo se añade lo que el spec no expresa: la coherencia de `ongoing`, las fechas y el motivo
 * de fin.
 */
export type CuerpoDeTratamiento = z.output<typeof zCreateManualPriorTreatmentBody>;

const CAMPOS_DEL_CONTRATO = Object.keys(zCreateManualPriorTreatmentBody.shape);

export function leerCuerpoDeTratamiento(cuerpo: unknown): LecturaDeCuerpo<CuerpoDeTratamiento> {
  const lectura = leerCuerpoDelContrato(zCreateManualPriorTreatmentBody, CAMPOS_DEL_CONTRATO, cuerpo);
  if (!lectura.valido) return lectura;
  const incoherente = campoIncoherenteDelFin(lectura.cuerpo);
  return incoherente === undefined ? lectura : cuerpoInvalido(incoherente);
}
