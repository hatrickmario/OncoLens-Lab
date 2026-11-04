import type { z } from 'zod';
import {
  zCreateManualBiomarkerBody,
  zCreateManualDiagnosisBody,
} from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';
import {
  cuerpoInvalido,
  leerCuerpoDelContrato,
  type LecturaDeCuerpo,
} from '../compartido/cuerpo-de-registro.js';

/**
 * Validación del borde de `POST …/biomarkers` y `POST …/diagnoses`: los schemas se generan del spec (`strictObject`: un
 * `grade` escrito a mano o cualquier campo ajeno es `CUERPO_INVALIDO`). Aquí solo se añade lo que el spec no expresa:
 * `minProperties: 1` del diagnóstico y el NOMBRE del campo que falló (`field` del 422, nunca su valor).
 */
export type CuerpoDeBiomarcador = z.output<typeof zCreateManualBiomarkerBody>;
export type CuerpoDeDiagnostico = z.output<typeof zCreateManualDiagnosisBody>;

const CAMPOS_DEL_BIOMARCADOR = Object.keys(zCreateManualBiomarkerBody.shape);
const CAMPOS_DEL_DIAGNOSTICO = Object.keys(zCreateManualDiagnosisBody.shape);

export function leerCuerpoDeBiomarcador(cuerpo: unknown): LecturaDeCuerpo<CuerpoDeBiomarcador> {
  return leerCuerpoDelContrato(zCreateManualBiomarkerBody, CAMPOS_DEL_BIOMARCADOR, cuerpo);
}

export function leerCuerpoDeDiagnostico(cuerpo: unknown): LecturaDeCuerpo<CuerpoDeDiagnostico> {
  const lectura = leerCuerpoDelContrato(zCreateManualDiagnosisBody, CAMPOS_DEL_DIAGNOSTICO, cuerpo);
  return lectura.valido && Object.keys(lectura.cuerpo).length === 0 ? cuerpoInvalido() : lectura;
}
