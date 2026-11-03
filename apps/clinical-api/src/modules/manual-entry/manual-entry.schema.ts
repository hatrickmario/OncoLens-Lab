import type { z } from 'zod';
import {
  zCreateManualBiomarkerBody,
  zCreateManualDiagnosisBody,
} from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';

/**
 * Validación del borde de `POST …/biomarkers` y `POST …/diagnoses`: los schemas se generan del spec (`strictObject`: un
 * `grade` escrito a mano o cualquier campo ajeno es `CUERPO_INVALIDO`). Aquí solo se añade lo que el spec no expresa:
 * `minProperties: 1` del diagnóstico.
 */
export type CuerpoDeBiomarcador = z.output<typeof zCreateManualBiomarkerBody>;
export type CuerpoDeDiagnostico = z.output<typeof zCreateManualDiagnosisBody>;

export function leerCuerpoDeBiomarcador(cuerpo: unknown): CuerpoDeBiomarcador | undefined {
  const leido = zCreateManualBiomarkerBody.safeParse(cuerpo);
  return leido.success ? leido.data : undefined;
}

export function leerCuerpoDeDiagnostico(cuerpo: unknown): CuerpoDeDiagnostico | undefined {
  const leido = zCreateManualDiagnosisBody.safeParse(cuerpo);
  if (!leido.success || Object.keys(leido.data).length === 0) return undefined;
  return leido.data;
}
