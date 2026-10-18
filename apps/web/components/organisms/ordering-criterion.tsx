import type { EvidenceAnalysis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { elegirCriterioDeOrden } from '../../lib/evidence/criterio-de-orden';
import { textoDe } from '../../lib/mensajes';

/** Criterio de orden visible encima de las opciones (RN-28), elegido por la respuesta. */
export function OrderingCriterion({
  analisis,
}: {
  analisis: Pick<EvidenceAnalysis, 'applicability'>;
}) {
  return <p>{textoDe(elegirCriterioDeOrden(analisis))}</p>;
}
