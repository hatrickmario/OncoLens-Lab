import type { AnalysisBasis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../mensajes';

type DatoUsado = AnalysisBasis['patientDataUsed'][number];

/** Estado de revisión y conflicto siempre en texto, nunca solo por color (WCAG); informa, no bloquea (RN-26). */
export function textoDeRevision(dato: Pick<DatoUsado, 'reviewStatus' | 'conflict'>): string {
  const { revision, enConflicto } = mensajes().evidence.base;
  const estado = revision[dato.reviewStatus];
  return dato.conflict ? `${estado} · ${enConflicto}` : estado;
}
