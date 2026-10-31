import type { DiscardedOption } from '../../../../packages/api-contracts/src/types/clinical-api';

type Motivo = DiscardedOption['discardReason'];

export interface MotivoResumido {
  motivo: Motivo;
  n: number;
}

/** Orden del enum `discardReason` del contrato; el `Record` rompe la compilación si el contrato añade un motivo. */
const INDICE_DE_MOTIVO: Record<Motivo, number> = {
  cita_invalida: 0,
  afirmacion_sin_soporte: 1,
  sin_citas: 2,
  solo_soportada_por_analisis_previo: 3,
  lenguaje_no_permitido: 4,
};

/** Agrupa las descartadas por motivo (RN-01), omite los motivos sin descartadas y ordena como el contrato. */
export function resumirMotivos(descartadas: DiscardedOption[]): MotivoResumido[] {
  const cuentas = new Map<Motivo, number>();
  for (const { discardReason } of descartadas) {
    cuentas.set(discardReason, (cuentas.get(discardReason) ?? 0) + 1);
  }
  return [...cuentas]
    .map(([motivo, n]) => ({ motivo, n }))
    .sort((a, b) => INDICE_DE_MOTIVO[a.motivo] - INDICE_DE_MOTIVO[b.motivo]);
}
