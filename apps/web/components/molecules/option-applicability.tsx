import type { ReactNode } from 'react';
import type { EvidenceOption } from '../../../../packages/api-contracts/src/types/clinical-api';
import { tieneAplicabilidadCalculada } from '../../lib/evidence/aplicabilidad-calculada';
import { mensajes } from '../../lib/mensajes';
import { ApplicabilityCounts } from './applicability-counts';
import { NonBlockingNotice } from './non-blocking-notice';

export interface OptionApplicabilityProps {
  opcion: EvidenceOption;
  /** Detalle por criterio: se coloca tras los conteos solo cuando la aplicabilidad se calculó. */
  children?: ReactNode;
}

/** Aplicabilidad de una opción: conteos si se calculó, "no evaluada" si no, y el aviso de población no comparable (RN-26, RN-28). */
export function OptionApplicability({ opcion, children }: OptionApplicabilityProps) {
  const { aplicabilidad } = mensajes().evidence;
  return (
    <>
      {tieneAplicabilidadCalculada(opcion) ? (
        <>
          <ApplicabilityCounts resumen={opcion.applicabilitySummary} />
          {children}
        </>
      ) : (
        <p>{aplicabilidad.noEvaluada}</p>
      )}
      {opcion.populationNotComparable && (
        <NonBlockingNotice>
          <p>{aplicabilidad.poblacionNoComparable}</p>
        </NonBlockingNotice>
      )}
    </>
  );
}
