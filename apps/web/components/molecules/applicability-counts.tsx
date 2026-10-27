import type { EvidenceOption } from '../../../../packages/api-contracts/src/types/clinical-api';

/** Línea de conteos de aplicabilidad de la opción (RN-28), solo texto. */
export function ApplicabilityCounts(_props: {
  resumen: EvidenceOption['applicabilitySummary'];
}): never {
  throw new Error('no implementado');
}
