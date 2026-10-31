import type { DiscardedOption } from '../../../../packages/api-contracts/src/types/clinical-api';
import { POLITICA_DE_MOTIVO, type Motivo } from './motivos-de-descarte';

export interface MotivoResumido {
  motivo: Motivo;
  n: number;
}

/** Agrupa las descartadas por motivo (RN-01), omite los motivos sin descartadas y ordena como el contrato. */
export function resumirMotivos(descartadas: DiscardedOption[]): MotivoResumido[] {
  const cuentas = new Map<Motivo, number>();
  for (const { discardReason } of descartadas) {
    cuentas.set(discardReason, (cuentas.get(discardReason) ?? 0) + 1);
  }
  return [...cuentas]
    .map(([motivo, n]) => ({ motivo, n }))
    .sort((a, b) => POLITICA_DE_MOTIVO[a.motivo].orden - POLITICA_DE_MOTIVO[b.motivo].orden);
}
