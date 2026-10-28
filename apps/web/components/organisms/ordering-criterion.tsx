import type { EvidenceAnalysis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { elegirCriterioDeOrden } from '../../lib/evidence/criterio-de-orden';
import { textoDe } from '../../lib/mensajes';

/**
 * Criterio de orden visible encima de las opciones (RN-28), elegido por la respuesta (US-062 AC-7, design D4);
 * un texto de orden, nunca una valoración clínica.
 */
export function OrderingCriterion({
  analisis,
}: {
  analisis: Pick<EvidenceAnalysis, 'evidenceOptions'>;
}) {
  return <p>{textoDe(elegirCriterioDeOrden(analisis))}</p>;
}
