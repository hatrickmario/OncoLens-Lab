import type { DiscardedOption } from '../../../../packages/api-contracts/src/types/clinical-api';

export interface MotivoResumido {
  motivo: DiscardedOption['discardReason'];
  n: number;
}

export function resumirMotivos(_descartadas: DiscardedOption[]): MotivoResumido[] {
  throw new Error('no implementado');
}
