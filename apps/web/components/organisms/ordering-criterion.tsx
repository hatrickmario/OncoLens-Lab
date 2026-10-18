import type { EvidenceAnalysis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { elegirCriterioDeOrden } from '../../lib/evidence/criterio-de-orden';
import { textoDe } from '../../lib/mensajes';

/**
 * Criterio de orden visible encima de las opciones (RN-28), elegido por la respuesta. Heurística
 * provisional del S1 (design D3): US-126 AC-7 la sustituye por un campo del contrato.
 */
export function OrderingCriterion({
  analisis,
}: {
  analisis: Pick<EvidenceAnalysis, 'applicability'>;
}) {
  return <p>{textoDe(elegirCriterioDeOrden(analisis))}</p>;
}
