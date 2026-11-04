import type { MotivoDeFin } from './ports.js';

/** Motivo de fin que se guarda de un tratamiento en curso: la columna es `NOT NULL` (`[S5 resp. 13]`). */
export const MOTIVO_DE_FIN_EN_CURSO: MotivoDeFin = 'desconocido';

interface CamposDelFin {
  readonly ongoing: boolean;
  readonly startedAt?: string | undefined;
  readonly endedAt?: string | undefined;
  readonly endReason?: MotivoDeFin | undefined;
}

/**
 * Coherencia entre `ongoing`, las fechas y el motivo de fin (design D3): uno en curso no lleva `endedAt` ni
 * `endReason`; uno terminado exige `endReason`, y `endedAt` no puede ser anterior a `startedAt` (fechas ISO: el orden
 * de texto es el cronológico). Devuelve el NOMBRE del primer campo incoherente, o `undefined` si todo cuadra.
 */
export function campoIncoherenteDelFin(cuerpo: CamposDelFin): 'endedAt' | 'endReason' | undefined {
  if (cuerpo.ongoing) {
    if (cuerpo.endedAt !== undefined) return 'endedAt';
    return cuerpo.endReason === undefined ? undefined : 'endReason';
  }
  if (cuerpo.endReason === undefined) return 'endReason';
  const terminaAntesDeEmpezar =
    cuerpo.startedAt !== undefined &&
    cuerpo.endedAt !== undefined &&
    cuerpo.endedAt < cuerpo.startedAt;
  return terminaAntesDeEmpezar ? 'endedAt' : undefined;
}

/** Motivo de fin que se persiste: el enviado, o `desconocido` mientras el tratamiento sigue en curso. */
export function motivoDeFinPersistido(cuerpo: Pick<CamposDelFin, 'endReason'>): MotivoDeFin {
  return cuerpo.endReason ?? MOTIVO_DE_FIN_EN_CURSO;
}
