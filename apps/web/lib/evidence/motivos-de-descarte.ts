import type { DiscardedOption } from '../../../../packages/api-contracts/src/types/clinical-api';

export type Motivo = DiscardedOption['discardReason'];

export interface PoliticaDeMotivo {
  /** Posición en el enum `discardReason` del contrato: ordena el resumen. */
  orden: number;
  /** Si la descartada muestra sus `unsupportedClaims` (con `lenguaje_no_permitido` se explican, no se muestran). */
  muestraAfirmaciones: boolean;
}

/** Un motivo nuevo del contrato rompe la compilación aquí: hay que decidir cómo se presenta. */
export const POLITICA_DE_MOTIVO: Record<Motivo, PoliticaDeMotivo> = {
  cita_invalida: { orden: 0, muestraAfirmaciones: true },
  afirmacion_sin_soporte: { orden: 1, muestraAfirmaciones: true },
  sin_citas: { orden: 2, muestraAfirmaciones: true },
  solo_soportada_por_analisis_previo: { orden: 3, muestraAfirmaciones: true },
  lenguaje_no_permitido: { orden: 4, muestraAfirmaciones: false },
};
