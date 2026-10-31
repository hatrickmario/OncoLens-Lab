import type { EvidenceAnalysis } from '../../../../packages/api-contracts/src/types/clinical-api';
import {
  CLAVE_CRITERIO_APLICABILIDAD,
  elegirCriterioDeOrden,
} from '../../lib/evidence/criterio-de-orden';
import { mensajes, textoDe } from '../../lib/mensajes';

/**
 * Criterio de orden visible encima de las opciones (RN-28), elegido por la respuesta (US-062 AC-7, design D4);
 * un texto de orden, nunca una valoración clínica. Solo con orden por aplicabilidad añade la frase de numeración.
 */
export function OrderingCriterion({
  analisis,
}: {
  analisis: Pick<EvidenceAnalysis, 'evidenceOptions'>;
}) {
  const clave = elegirCriterioDeOrden(analisis);
  return (
    <>
      <p>{textoDe(clave)}</p>
      {clave === CLAVE_CRITERIO_APLICABILIDAD && (
        <p>{mensajes().evidence.orderCriterion.numeracion}</p>
      )}
    </>
  );
}
