import type { EvidenceAnalysis } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { RegistroDeAnalisis } from './analysis-record.js';

/** `EvidenceAnalysis` de la respuesta `200`, construido desde lo persistido (no desde la respuesta de Backend 2). */
export function aEvidenceAnalysis(
  _registro: RegistroDeAnalisis,
  _disclaimer: string,
): EvidenceAnalysis {
  throw new Error('no implementado');
}
